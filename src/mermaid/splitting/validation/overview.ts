import type { GraphEdge } from "../../parsing/graph.ts";
import { homeOf, regionWithin, type WorkGraph } from "../graph/model.ts";
import { joined } from "../planning/candidates.ts";
import {
  type Build,
  isGroupKey,
  over,
  type Partition,
  partFromGroups,
  type SplitGroup,
  type SplitPlan,
} from "../planning/state.ts";
import { reversible } from "../projection/quotient.ts";

type Violations = string[];

// The overview node id an original endpoint is drawn in, read from the plan.
export const overOf = (build: Build): ((id: string) => string) => {
  const part: Partition = partFromGroups(build.plan.groups);
  const idOfFirst = new Map(build.plan.groups.map((g) => [g.members[0] ?? "", g.id]));

  return (id) => {
    const k = over(part, id);

    return isGroupKey(k) ? (idOfFirst.get(k.slice(1)) ?? k) : k;
  };
};

export const groupIds = (plan: SplitPlan): Set<string> => new Set(plan.groups.map((g) => g.id));

// 1. Every original node is in exactly one overview node, groups are
// disjoint, and each group folds whole regions inside the region it sits in.
export const checkPartition = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = [];
  const kept = plan.overview.nodes.map((n) => n.id).filter((id) => !groupIds(plan).has(id));
  const seen = [...kept, ...plan.groups.flatMap((g) => g.members)];
  const counts = new Map<string, number>();

  for (const id of seen) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  out.push(
    ...work.ids
      .filter((id) => counts.get(id) !== 1)
      .map((id) => `1: node ${id} is in ${counts.get(id) ?? 0} overview nodes`),
  );
  out.push(...[...counts.keys()].filter((id) => !work.nodes.has(id)).map((id) => `1: ${id} is not an original node`));

  for (const g of plan.groups) {
    out.push(...laminar(work, g));
  }

  for (const g of plan.groups.filter((x) => x.tier === "T6" && !joined(work, x))) {
    out.push(`1: suggested group ${g.id} is not connected`);
  }

  return out;
};

const laminar = (work: WorkGraph, g: SplitGroup): Violations => {
  const regions = new Set(g.regions);
  const fits = (r: string | null): boolean => (r !== null && regions.has(r)) || r === g.parent;
  const inside = (r: string | null): boolean => g.regions.some((x) => regionWithin(work, r, x));

  return [
    ...(g.members.length === 0 ? [`1: group ${g.id} is empty`] : []),
    ...(g.parent !== null && regions.has(g.parent) ? [`1: group ${g.id} sits inside a region it folds`] : []),
    ...g.members.filter((m) => !fits(homeOf(work, m))).map((m) => `1: ${m} crosses the regions of group ${g.id}`),
    ...g.regions
      .filter((r) => !fits(work.regions.get(r)?.parent ?? null))
      .map((r) => `1: region ${r} crosses group ${g.id}`),
    ...work.ids
      .filter((id) => inside(homeOf(work, id)) && !g.members.includes(id))
      .map((id) => `1: ${id} is left out of a region group ${g.id} folds`),
    ...work.regionIds
      .filter((r) => inside(r) && !regions.has(r))
      .map((r) => `1: region ${r} is left out of group ${g.id}`),
  ];
};

export const edgeOf = (work: WorkGraph): Map<string, GraphEdge> => new Map(work.edges.map((e) => [e.id, e]));

// 2. Each overview edge stands for original edges between its two ends, and
// each original edge between two overview nodes is stood for exactly once.
// Between two kept nodes an overview edge stands for exactly one. Only an
// undirected edge with a group at an end may stand for edges of its own kind
// written the other way, and the plan declares how many it stands for.
const coverageCounts = (build: Build, covered: Map<string, number>): Violations => {
  const overId = overOf(build);
  const groups = groupIds(build.plan);
  const want = (edge: GraphEdge): number =>
    overId(edge.source) === overId(edge.target) && groups.has(overId(edge.source)) ? 0 : 1;

  return build.work.edges
    .filter((edge) => (covered.get(edge.id) ?? 0) !== want(edge))
    .map((edge) => `2: original edge ${edge.source} -> ${edge.target} is covered ${covered.get(edge.id) ?? 0} times`);
};

export const checkEdges = (build: Build): Violations => {
  const { plan, work, covers } = build;
  const overId = overOf(build);
  const edges = edgeOf(work);
  const groups = groupIds(plan);
  const covered = new Map<string, number>();
  let reversed = 0;
  const strays = plan.overview.edges.flatMap((o) => {
    const ids = covers[o.id] ?? [];

    for (const id of ids) {
      covered.set(id, (covered.get(id) ?? 0) + 1);
    }

    const kept = !(groups.has(o.source) || groups.has(o.target));

    // An undirected edge written the other way, of the overview edge's own kind.
    const back = (e: GraphEdge): boolean =>
      reversible(o, !kept) && e.kind === o.kind && overId(e.source) === o.target && overId(e.target) === o.source;
    const away = ids.filter((id) => {
      const e = edges.get(id);

      if (e && back(e)) {
        reversed++;
      }

      return !e || ((overId(e.source) !== o.source || overId(e.target) !== o.target) && !back(e));
    });

    return [
      ...(ids.length === 0 ? [`2: overview edge ${o.source} -> ${o.target} stands for no original edge`] : []),
      ...(kept && ids.length > 1 ? [`2: overview edge ${o.id} between kept nodes merges ${ids.length} edges`] : []),
      ...away.map((id) => `2: overview edge ${o.id} covers ${id} from elsewhere`),
    ];
  });

  return [
    ...strays,
    ...(reversed === plan.loss.reversedEdges ? [] : ["2: the declared edges drawn the other way are wrong"]),
    ...coverageCounts(build, covered),
  ];
};

const ATTRS = ["label", "markdown", "kind", "cardinality"] as const;

// 3. An overview edge carries an attribute only when every edge it covers
// agrees; between two kept nodes it is an exact copy; an erDiagram never
// merges two cardinalities or labels. A group shape is one all members share.
export const checkAttributes = (build: Build): Violations => {
  const { plan, work, covers } = build;
  const edges = edgeOf(work);
  const groups = groupIds(plan);
  const edgeViolations = plan.overview.edges.flatMap((o) => {
    const covered = (covers[o.id] ?? []).flatMap((id) => edges.get(id) ?? []);
    const exact = work.family === "er" || !(groups.has(o.source) || groups.has(o.target));
    const claims = (a: (typeof ATTRS)[number]): boolean =>
      exact || o[a] !== undefined || (a === "markdown" && o.label !== undefined);

    return ATTRS.filter((a) => claims(a) && covered.some((e) => e[a] !== o[a])).map(
      (a) => `3: overview edge ${o.source} -> ${o.target} ${a} disagrees with an edge it covers`,
    );
  });
  const shapeViolations = plan.groups
    .filter((g) => g.shape !== undefined && g.members.some((m) => work.nodes.get(m)?.shape !== g.shape))
    .map((g) => `3: group ${g.id} claims a shape its members do not share`);

  return [...edgeViolations, ...shapeViolations];
};
