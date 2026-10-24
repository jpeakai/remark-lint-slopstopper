import type { ThresholdConfig } from "../../complexity/metrics.ts";
import { directedGraph } from "../graph/directed.ts";
import { homeOf, regionWithin, type WorkGraph } from "../graph/model.ts";
import { byText } from "../graph/order.ts";
import { isJunction } from "../graph/ownership.ts";
import { mixesFamilies, stageOf, statusFamilies } from "../labels/stems.ts";
import { detailShape, detailView } from "../projection/detail.ts";
import { meets, type QEdge, scoreOf } from "../projection/quotient.ts";
import {
  type FoldRules,
  hubsOf,
  splitsBranches,
  terminalsOf,
} from "./constraints.ts";
import {
  type Group,
  groupOfKey,
  isGroupKey,
  type Merge,
  membersOfKey,
  merge,
  over,
  type Partition,
} from "./state.ts";

// What every tier shares: the context a tier proposes from, the candidate it
// proposes, and the overview's adjacency read from the merged edges.

export interface Candidate extends Merge {
  // T6 orders by modularity gain, not by score per node.
  priority?: number;
  // T6 breaks a tie between equal gains by label similarity.
  tie?: number;
  // T6 takes a pair naming one prefix family before any other: 1, else 0.
  kin?: number;
  // Of two pairs of one prefix family tied on gain and label, T6 takes the
  // one whose members share more of their overview neighbours first, so a
  // layer folds in step with the layer beside it already folded.
  align?: number;
  // Whether the merge may add no new reachable pair: a trimmed aggregate.
  lossless?: true;
  // Merges of the same pattern applied in the same step: every stage of one
  // chain, every run of one twin class. A plan then folds the pattern evenly,
  // not one stage of it.
  also?: Merge[];
  // Whether the group may fold whatever its detail's size, the detail split
  // again: twin chains folded whole (MJL-0038).
  splits?: true;
}

export interface LaneSearch {
  mode: "nested" | "whole" | "staged";
  encountered: boolean;
}

export interface CandidateContext {
  work: WorkGraph;
  part: Partition;
  config: ThresholdConfig;
  qedges: QEdge[];
  rules: FoldRules;
  // Whether the step may fold a group whose detail is over the target, to be
  // split again: author regions and aggregates on the first walk.
  uncapped?: boolean;
  lanes?: LaneSearch;
}

export interface Adjacency {
  out: Map<string, QEdge[]>;
  in: Map<string, QEdge[]>;
}

export const adjacencyOf = (qedges: QEdge[]): Adjacency => {
  const out = new Map<string, QEdge[]>();
  const inn = new Map<string, QEdge[]>();
  for (const e of qedges) {
    out.set(e.source, [...(out.get(e.source) ?? []), e]);
    inn.set(e.target, [...(inn.get(e.target) ?? []), e]);
  }
  return { out, in: inn };
};

// The distinct overview nodes a node shares an edge with, itself left out.
export const neighboursOf = (adj: Adjacency, key: string): Set<string> => {
  const set = new Set<string>();
  for (const e of adj.out.get(key) ?? []) set.add(e.target);
  for (const e of adj.in.get(key) ?? []) set.add(e.source);
  set.delete(key);
  return set;
};

// A group, or a kept node that is not protected. A subgraph used as an edge
// end, or a lollipop, is never folded on its own.
export const groupable = (ctx: CandidateContext, key: string): boolean =>
  isGroupKey(key) ||
  (ctx.work.nodes.has(key) && !ctx.work.protectedIds.has(key));

// A node the rules keep in view: a hub, an erDiagram junction between two
// aggregate roots, which folds into neither side, or a decision region
// holding a hub, which T2 folded and which T5 and T6 fold no further; and,
// under its own rule, a shared terminal many paths end at.
export const keptHub = (ctx: CandidateContext, key: string): boolean => {
  const g = groupOfKey(ctx.part, key);
  if (!g && ctx.rules.keepTerminals && terminalsOf(ctx.work).has(key))
    return true;
  if (!ctx.rules.keepHubs) return false;
  if (!g) return hubsOf(ctx.work).has(key) || isJunction(ctx.work, key);
  return (
    g.reason === "decision region" &&
    g.members.some((m) => hubsOf(ctx.work).has(m))
  );
};

// What T5 and T6 may fold: a groupable key that is no hub kept in view.
export const foldable = (ctx: CandidateContext, key: string): boolean =>
  groupable(ctx, key) && !keptHub(ctx, key);

// Whether merging these keys keeps a decision's branches apart, as the rules ask.
export const keepsBranches = (
  ctx: CandidateContext,
  keys: readonly string[],
): boolean =>
  !(
    ctx.rules.keepBranches &&
    splitsBranches(
      ctx.work,
      keys.flatMap((k) => groupOfKey(ctx.part, k)?.members ?? [k]),
    )
  );

const familyCache = new WeakMap<WorkGraph, Map<string, string | null>>();

// The prefix family of each original node (stem.ts), read once per graph.
export const familyOf = (work: WorkGraph, id: string): string | null => {
  let known = familyCache.get(work);
  if (!known) {
    const labels = new Map(
      work.ids.map((x) => [x, work.nodes.get(x)?.label ?? x]),
    );
    const status = statusFamilies(labels);
    known = new Map(
      work.ids.map((x) => [
        x,
        stageOf(labels.get(x) ?? x, x) ?? status.get(x) ?? null,
      ]),
    );
    familyCache.set(work, known);
  }
  return known.get(id) ?? null;
};

// The prefix families of the members behind each key.
export const familiesOf = (
  ctx: CandidateContext,
  keys: readonly string[],
): Array<string | null> =>
  keys
    .flatMap((k) => membersOfKey(ctx.part, k))
    .map((m) => familyOf(ctx.work, m));

// Whether merging these keys keeps to one prefix family, as the rules ask.
export const keepsFamilies = (
  ctx: CandidateContext,
  keys: readonly string[],
): boolean => !(ctx.rules.keepFamilies && mixesFamilies(familiesOf(ctx, keys)));

const MIXED = "\u0001mixed";

export const shapeOfKey = (ctx: CandidateContext, key: string): string => {
  const g = groupOfKey(ctx.part, key);
  if (!g) return ctx.work.nodes.get(key)?.shape ?? "";
  const shapes = new Set(
    g.members.map((m) => ctx.work.nodes.get(m)?.shape ?? ""),
  );
  return shapes.size === 1 ? ([...shapes][0] ?? "") : MIXED;
};

// One candidate applying every merge given, the first carrying the rest.
export const together = (merges: Candidate[]): Candidate[] => {
  const [first, ...rest] = merges;
  return first ? [rest.length > 0 ? { ...first, also: rest } : first] : [];
};

// The group a merge of these keys made in the next partition.
export const mergedGroup = (
  before: Partition,
  after: Partition,
  keys: readonly string[],
): Group | undefined => {
  const first =
    keys.map((k) => groupOfKey(before, k)?.members[0] ?? k).sort(byText)[0] ??
    "";
  return after.groups[after.groupOf.get(first) ?? -1];
};

// The same detail target governs existing groups, candidate merges, and planner admission.
export const detailFits = (
  ctx: CandidateContext,
  part: Partition,
  group: Group,
): boolean => {
  const shape = detailShape(ctx.work, detailView(ctx.work, part, group));
  return meets(shape.nodes, scoreOf(shape, 0, ctx.config), ctx.config);
};

// A proposed member set must not absorb only part of an existing group.
export const completeKeys = (
  ctx: CandidateContext,
  members: readonly string[],
): string[] | null => {
  const inside = new Set(members);
  const keys = [
    ...new Set(members.map((member) => over(ctx.part, member))),
  ].sort(byText);
  return keys.length >= 2 &&
    keys.every((key) =>
      membersOfKey(ctx.part, key).every((member) => inside.has(member)),
    )
    ? keys
    : null;
};

// Whether the group a merge would make gets a detail diagram within target.
export const mergeFits = (ctx: CandidateContext, m: Merge): boolean => {
  const next = merge(ctx.part, m);
  const g = mergedGroup(ctx.part, next, m.keys);
  if (!g) return false;
  return detailFits(ctx, next, g);
};

// Whether a group already in the partition has a detail within target.
export const groupFits = (ctx: CandidateContext, key: string): boolean => {
  const g = groupOfKey(ctx.part, key);
  if (!g) return true;
  return detailFits(ctx, ctx.part, g);
};

// Splits keys, in the order given, into runs whose merged detail fits,
// keeping runs of two or more.
export const chunksThatFit = (
  ctx: CandidateContext,
  keys: string[],
  base: Omit<Merge, "keys">,
): Candidate[] => {
  return fittingChunks(keys, (chunk) =>
    mergeFits(ctx, { ...base, keys: chunk }),
  )
    .filter((chunk) => chunk.length >= 2)
    .map((keys) => ({ ...base, keys }));
};

// Whether a suggested group's members are connected: two members are joined
// by an edge between them, by an author region the group folds whole holding
// both, or by a neighbour they share when both name one prefix family (one
// stage of a pipeline) or both are leaves (sibling leaves of one node), as T5
// and T6 merge them and no other way (MJL-0032).
export const joined = (
  work: WorkGraph,
  g: { members: readonly string[]; regions: readonly string[] },
): boolean => {
  const { members } = g;
  const regionOf = (x: string): string | undefined =>
    g.regions.find((r) => regionWithin(work, homeOf(work, x), r));
  const around = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    around.set(a, new Set([...(around.get(a) ?? []), b]));
    around.set(b, new Set([...(around.get(b) ?? []), a]));
  };
  for (const e of work.edges)
    if (e.source !== e.target) link(e.source, e.target);
  const leaf = (x: string): boolean => (around.get(x)?.size ?? 0) === 1;
  const kin = (a: string, b: string): boolean => {
    if (regionOf(a) !== undefined && regionOf(a) === regionOf(b)) return true;
    const fa = familyOf(work, a);
    const shares = [...(around.get(a) ?? [])].some((x) =>
      around.get(b)?.has(x),
    );
    return (
      shares &&
      ((fa !== null && fa === familyOf(work, b)) || (leaf(a) && leaf(b)))
    );
  };
  const pairs = members.flatMap((a, i) =>
    members
      .slice(i + 1)
      .filter((b) => around.get(a)?.has(b) || kin(a, b))
      .map((b) => [a, b] as const),
  );
  const graph = directedGraph(pairs, members);
  try {
    return graph.elements().components().length <= 1;
  } finally {
    graph.destroy();
  }
};

// Preserve input order while packing details to their target. Singletons remain visible.
export function fittingChunks<T>(
  items: readonly T[],
  fits: (chunk: T[]) => boolean,
): T[][] {
  const chunks: T[][] = [];
  for (const item of items) {
    const last = chunks.at(-1);
    if (last && fits([...last, item])) last.push(item);
    else chunks.push([item]);
  }
  return chunks;
}

// Equal rounded boundaries are shared by twin runs, parallel lanes, and ID families.
export function evenSlices<T>(items: readonly T[], count: number): T[][] {
  return Array.from({ length: count }, (_, i) =>
    items.slice(
      Math.round((i * items.length) / count),
      Math.round(((i + 1) * items.length) / count),
    ),
  );
}
