import type { DiagramGraph } from "../../parsing/graph.ts";
import type { WorkGraph } from "../graph/model.ts";
import { byTuple, sorted } from "../graph/order.ts";

export interface Group {
  members: string[];
  regions: string[];
  parent: string | null;
  tier: Tier;
  reason: string;
  // The decision a decision region starts at, which names the group.
  head?: string;
}

export interface Partition {
  groups: Group[];
  groupOf: Map<string, number>;
  regionOf: Map<string, number>;
}

// A group's key in the overview while planning. Ids never hold U+0000, so a
// key never meets a node id.
export const GROUP_MARK = "\u0000";

export const keyOf = (g: Group): string => `${GROUP_MARK}${g.members[0] ?? ""}`;
export const isGroupKey = (key: string): boolean => key.startsWith(GROUP_MARK);

export const partitionOf = (groups: Group[]): Partition => {
  const ordered = [...groups].sort((a, b) => byTuple(a.members, b.members));
  const groupOf = new Map<string, number>();
  const regionOf = new Map<string, number>();
  for (let i = 0; i < ordered.length; i++) {
    for (const m of ordered[i]?.members ?? []) groupOf.set(m, i);
    for (const r of ordered[i]?.regions ?? []) regionOf.set(r, i);
  }
  return { groups: ordered, groupOf, regionOf };
};

export const EMPTY_PARTITION: Partition = partitionOf([]);

export const groupOfKey = (part: Partition, key: string): Group | undefined =>
  isGroupKey(key)
    ? part.groups[part.groupOf.get(key.slice(1)) ?? -1]
    : undefined;

// The overview node an original endpoint is drawn in: its group, or itself. A
// lollipop interface is never folded, so the overview draws it on the group
// of the class it hangs from, and the class's detail draws it too.
export const over = (part: Partition, id: string): string => {
  const g = part.groupOf.get(id) ?? part.regionOf.get(id);
  return g === undefined ? id : keyOf(part.groups[g] as Group);
};

export interface Merge {
  keys: string[];
  regions?: string[];
  parent: string | null;
  tier: Tier;
  reason: string;
  head?: string;
}

export const merge = (part: Partition, m: Merge): Partition => {
  const taken = new Set<number>();
  const members: string[] = [];
  const regions: string[] = [...(m.regions ?? [])];
  for (const key of m.keys) {
    const i = isGroupKey(key) ? part.groupOf.get(key.slice(1)) : undefined;
    const g = i === undefined ? undefined : part.groups[i];
    if (i === undefined || !g) {
      members.push(key);
      continue;
    }
    taken.add(i);
    members.push(...g.members);
    regions.push(...g.regions);
  }
  const group: Group = {
    members: sorted(new Set(members)),
    regions: sorted(new Set(regions)),
    parent: m.parent,
    tier: m.tier,
    reason: m.reason,
    ...(m.head !== undefined ? { head: m.head } : {}),
  };
  return partitionOf([...part.groups.filter((_, i) => !taken.has(i)), group]);
};

export const overviewKeys = (work: WorkGraph, part: Partition): string[] => [
  ...work.ids.filter((id) => !part.groupOf.has(id)),
  ...part.groups.map(keyOf),
];

export const parentOfKey = (
  work: WorkGraph,
  part: Partition,
  key: string,
): string | null => {
  const g = groupOfKey(part, key);
  if (g) return g.parent;
  return work.nodes.get(key)?.parent ?? work.regions.get(key)?.parent ?? null;
};

export const membersOfKey = (part: Partition, key: string): string[] =>
  groupOfKey(part, key)?.members ?? [key];

export interface Snapshot {
  tier: Tier;
  groups: Array<{ members: string[]; regions: string[] }>;
}

export interface Folded {
  work: WorkGraph;
  part: Partition;
  snapshots: Snapshot[];
  tier: Tier;
}

// A plan with what the contract needs beside it: the graph it was planned
// from, which original edges each overview edge covers, the partition after
// each tier, and the build of every detail split again.
export interface Build {
  plan: SplitPlan;
  work: WorkGraph;
  covers: Record<string, string[]>;
  snapshots: Snapshot[];
  nested: Record<string, Build>;
}

export type SplitDetailFn = (work: WorkGraph) => Build | string;

export const snapshotOf = (tier: Tier, part: Partition): Snapshot => ({
  tier,
  groups: part.groups.map((g) => ({ members: g.members, regions: g.regions })),
});

export const partFromGroups = (
  groups: Array<{ members: string[]; regions: string[] }>,
): Partition =>
  partitionOf(
    groups.map((g) => ({
      members: g.members,
      regions: g.regions,
      parent: null,
      tier: "T1",
      reason: "",
    })),
  );

// The shape of a split plan: an overview where some node sets are folded into
// one group node, plus one detail diagram per group. Overview and details
// together recover every original node and edge, which contract.ts proves
// before a plan is offered.

// The tiers, least lossy first. T1 is presentation only (rows dropped, exact
// duplicate edges merged) and folds no node.
export type Tier = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";

export interface SplitGroup {
  // g1, g2 and on, in the order of the sorted member tuples.
  id: string;
  // The label shown: an author label, or a member's label (the member with
  // the highest degree then smallest id, unless another group shows its
  // label), cut to LABEL_CAP characters, followed by " (+N)".
  label: string;
  // The label's two parts: the whole author or member label, and N.
  labelBase: string;
  hidden: number;
  // For a pair label, the other member's label it shows in place of " (+N)",
  // as "ROOM (+BUILDING)", N then 0 (SLOP-0033).
  paired?: string;
  // Whether the label is a span label, naming the member a flowchart group's
  // flow enters at and the one it leaves from, as "git push to main → tsc
  // --noEmit (+4)" (SLOP-0035).
  spanned?: true;
  // Whether the label is a markdown string, as the label it is taken from.
  markdown?: true;
  members: string[];
  // The author regions folded whole into the group: flowchart subgraphs,
  // composite state boxes and class namespaces, by their graph id.
  regions: string[];
  // The region the group node sits in, or null at the top level.
  parent: string | null;
  tier: Tier;
  reason: string;
  // Every member's shape, when all members agree.
  shape?: string;
}

export interface SplitDetail {
  // The id of the group this diagram details.
  group: string;
  graph: DiagramGraph;
  // Each stub's id in this diagram, mapped to the original node, subgraph or
  // interface it stands for, or to the id of the group it stands for whole.
  stubs: Record<string, string>;
  // Whether the members' rows (erDiagram attributes, class members) are drawn.
  rows: boolean;
  source: string;
  nodes: number;
  score: number;
  // A detail too large for the target is split once more, bounded at depth 2.
  split: SplitPlan | null;
}

// A diagram drawing the rows of nodes kept in the overview, which draws no
// rows: an erDiagram's entities with their attributes, or a classDiagram's
// classes with their members.
export interface RowDetail {
  members: string[];
  graph: DiagramGraph;
  source: string;
  nodes: number;
  score: number;
}

export interface SplitLoss {
  // Overview node pairs reachable in the overview but not in the original.
  newReachablePairs: number;
  // The same count after each tier the plan walked, as the partition stood.
  byTier: Partial<Record<Tier, number>>;
  // ER attributes and class members drawn in no diagram of the plan.
  droppedRows: number;
  // Start and end transitions the overview draws merged onto a group, beyond
  // the one drawn for them: each is drawn as written in the group's detail.
  mergedMarkers: number;
  // Undirected edges the overview draws on the edge between the same two nodes
  // written the other way, at least one a group: each is drawn as written in
  // a detail.
  reversedEdges: number;
}

export interface LadderStep {
  tier: Tier;
  nodes: number;
  score: number;
}

export interface SplitPlan {
  diagram_type: string;
  // The last tier that changed the plan.
  tier: Tier;
  // Why the plan was offered: the size the diagram was measured at, the
  // split target, and which measure is over (SLOP-0035).
  flagged: string;
  groups: SplitGroup[];
  overview: DiagramGraph;
  overviewSource: string;
  overviewNodes: number;
  overviewScore: number;
  details: SplitDetail[];
  rowDetails: RowDetail[];
  loss: SplitLoss;
  // The overview after each tier the plan walked, as the partition stood: how
  // the ladder climbed to the tier that met the target.
  ladder: LadderStep[];
}

// What reads better than the diagram where no plan is offered because a list
// or a table would: a star's hub and leaves as a markdown list, or a dense
// mesh as a markdown adjacency matrix, drawing every node and edge.
export interface SplitAlternative {
  kind: "list" | "matrix";
  markdown: string;
}

// Why no plan was offered, beside the plan when there is one, and when a list
// or a table reads better, that list or table.
export interface SplitOutcome {
  plan: SplitPlan | null;
  reason: string;
  violations: string[];
  alternative?: SplitAlternative;
}
