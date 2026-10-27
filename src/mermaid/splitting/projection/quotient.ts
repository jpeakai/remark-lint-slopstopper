import { calculateComplexity, type ThresholdConfig } from "../../complexity/metrics.ts";
import type { GraphEdge } from "../../parsing/graph.ts";
import { edgeKey, type WorkGraph } from "../graph/model.ts";
import { byText } from "../graph/order.ts";
import {
  GROUP_MARK,
  isGroupKey,
  type LadderStep,
  over,
  type Partition,
  partFromGroups,
  type Snapshot,
} from "../planning/state.ts";

export interface QEdge {
  source: string;
  target: string;
  label?: string;
  markdown?: true;
  kind?: string;
  cardinality?: string;
  covers: string[];
}

const agreed = (edges: GraphEdge[], pick: (e: GraphEdge) => string | undefined): string | undefined => {
  const first = edges[0] ? pick(edges[0]) : undefined;

  return first !== undefined && edges.every((e) => pick(e) === first) ? first : undefined;
};

// A merged edge keeps an attribute only when every original agrees. The
// markdown flag belongs to the label, so equal text with different rendering
// does not qualify as an agreed label.
export const agreedAttributes = (edges: GraphEdge[]): Pick<QEdge, "label" | "markdown" | "kind" | "cardinality"> => {
  const label = agreed(edges, (e) => (e.label === undefined ? undefined : `${e.markdown ? "m" : "s"}${e.label}`));
  const kind = agreed(edges, (e) => e.kind);
  const cardinality = agreed(edges, (e) => e.cardinality);

  return {
    ...(label !== undefined
      ? {
          label: label.slice(1),
          ...(label.startsWith("m") ? { markdown: true as const } : {}),
        }
      : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(cardinality !== undefined ? { cardinality } : {}),
  };
};

// Merges what may merge: between two kept nodes nothing, since the overview is
// the only diagram that draws that edge and an edge written twice must read
// back twice; with a group at either end, every edge of the pair, keeping only
// the attributes all agree on. An erDiagram never merges two cardinalities or
// two labels.
const bucketKey = (work: WorkGraph, e: GraphEdge, a: string, b: string): string => {
  if (!(isGroupKey(a) || isGroupKey(b))) {
    return `${GROUP_MARK}${e.id}`;
  }

  if (work.family === "er") {
    return [a, b, e.label ?? "", e.cardinality ?? ""].join(GROUP_MARK);
  }

  return `${a}${GROUP_MARK}${b}`;
};

// The edge kinds with no direction: a flowchart link with no arrowhead, and a
// classDiagram link with no end marker.
export const UNDIRECTED_KINDS: ReadonlySet<string> = new Set(["---", "-.-", "===", "~~~", "--", ".."]);

// Whether an overview edge may stand for edges written the other way: it has
// a group at one end or both, an undirected kind and no cardinality.
export const reversible = (e: Pick<QEdge, "kind" | "cardinality">, grouped: boolean): boolean =>
  grouped && e.kind !== undefined && UNDIRECTED_KINDS.has(e.kind) && e.cardinality === undefined;

// One overview edge for an undirected edge written both ways between the
// same two overview nodes, at least one a group: the pair, kind and label all
// agree, so the edge the other way draws nothing new. Each detail still draws
// each original edge as written.
const mergeReversed = (edges: QEdge[]): QEdge[] => {
  const byKey = new Map(edges.map((e) => [edgeKey(e), e]));
  const dropped = new Set<QEdge>();

  for (const e of edges) {
    if (dropped.has(e) || !reversible(e, isGroupKey(e.source) || isGroupKey(e.target))) {
      continue;
    }

    const back = byKey.get(edgeKey({ ...e, source: e.target, target: e.source }));

    if (!back || back === e || dropped.has(back)) {
      continue;
    }

    dropped.add(back);
    e.covers = [...e.covers, ...back.covers];
  }

  return edges.filter((e) => !dropped.has(e));
};

export const quotientEdges = (work: WorkGraph, part: Partition): QEdge[] => {
  const buckets = new Map<string, { source: string; target: string; edges: GraphEdge[] }>();

  for (const e of work.edges) {
    const [a, b] = [over(part, e.source), over(part, e.target)];

    if (a === b && isGroupKey(a)) {
      continue;
    }

    const key = bucketKey(work, e, a, b);
    const bucket = buckets.get(key) ?? { source: a, target: b, edges: [] };

    bucket.edges.push(e);
    buckets.set(key, bucket);
  }

  const merged = [...buckets.values()]
    .map(({ source, target, edges }) => ({
      source,
      target,
      ...agreedAttributes(edges),
      covers: edges.map((e) => e.id),
    }))
    .sort((x, y) => byText(edgeKey(x), edgeKey(y)));

  return mergeReversed(merged);
};

// The overview edges beside another between the same two overview nodes, at
// least one a group, that stand for edges between other ends than it does:
// parallel lines a fold drew, where the original draws one. Edges the
// original itself draws side by side between two nodes are not counted.
export const foldedParallels = (work: WorkGraph, qedges: readonly QEdge[]): number => {
  const ends = new Map(work.edges.map((e) => [e.id, [e.source, e.target].sort(byText).join("\u0000")]));
  const pairs = new Map<string, Set<string>[]>();

  for (const e of qedges) {
    if (!(isGroupKey(e.source) || isGroupKey(e.target))) {
      continue;
    }

    const pair = [e.source, e.target].sort(byText).join("\u0000");

    pairs.set(pair, [...(pairs.get(pair) ?? []), new Set(e.covers.map((id) => ends.get(id) ?? id))]);
  }

  let count = 0;

  for (const drawn of pairs.values()) {
    if (drawn.length > 1 && new Set(drawn.flatMap((d) => [...d])).size > 1) {
      count += drawn.length - 1;
    }
  }

  return count;
};

export interface Shape {
  nodes: number;
  edges: number;
  subgraphs: number;
  depth: number;
}

// How deep a set of regions nests, counting only regions in the set.
export const nestingDepth = (regions: readonly string[], parentOf: (r: string) => string | null): number => {
  const inSet = new Set(regions);
  let max = 0;

  for (const r of regions) {
    let depth = 0;
    const seen = new Set<string>();

    for (let cur: string | null = r; cur !== null && inSet.has(cur) && !seen.has(cur); cur = parentOf(cur)) {
      seen.add(cur);
      depth++;
    }

    max = Math.max(max, depth);
  }

  return max;
};

export const remainingRegions = (work: WorkGraph, part: Partition): string[] =>
  work.regionIds.filter((r) => !part.regionOf.has(r));

export const overviewShape = (work: WorkGraph, part: Partition, qedges: QEdge[]): Shape => {
  const remaining = remainingRegions(work, part);

  return {
    nodes: work.ids.length - part.groupOf.size + part.groups.length,
    edges: qedges.length,
    subgraphs: remaining.length,
    depth: nestingDepth(remaining, (r) => work.regions.get(r)?.parent ?? null),
  };
};

export const scoreOf = (shape: Shape, rows: number, config: ThresholdConfig): number =>
  calculateComplexity(
    {
      nodes: shape.nodes,
      edges: shape.edges,
      subgraphs: shape.subgraphs,
      max_subgraph_depth: shape.depth,
      max_tree_depth: 0,
      rows,
      node_ids: [],
      subgraph_names: [],
      parser_used: "mermaid-core",
      diagram_type: "",
      error: null,
    },
    config,
  ).visual_complexity_score;

export const meets = (nodes: number, score: number, config: ThresholdConfig): boolean =>
  nodes <= config.node_target && score <= config.vcs_target;

// How many original edges the overview draws on an edge written the other way.
export const reversedEdges = (work: WorkGraph, part: Partition): number => {
  const sourceOf = new Map(work.edges.map((e) => [e.id, e.source]));

  return quotientEdges(work, part).reduce(
    (n, q) => n + q.covers.filter((id) => over(part, sourceOf.get(id) ?? "") !== q.source).length,
    0,
  );
};

// The overview's size after each tier walked, measured as the plan is.
export const ladderOf = (work: WorkGraph, snapshots: Snapshot[], config: ThresholdConfig): LadderStep[] =>
  snapshots.map((s) => {
    const part = partFromGroups(s.groups);
    const shape = overviewShape(work, part, quotientEdges(work, part));

    return {
      tier: s.tier,
      nodes: shape.nodes,
      score: scoreOf(shape, 0, config),
    };
  });
