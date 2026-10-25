import { directedGraph, reachableFrom } from "../graph/directed.ts";
import {
  type Decision,
  decisionsOf,
  flowRegionsOf,
} from "../graph/flow-regions.ts";
import type { WorkGraph } from "../graph/model.ts";
import { byNatural } from "../graph/order.ts";
import { UNDIRECTED_KINDS } from "../projection/quotient.ts";

// What T5 and T6 may not fold, so an overview still tells the diagram's story:
// its hubs stay in view, a decision's branches stay apart, and no group hides
// a single node. A plan holds to these first and relaxes them, in order, only
// when the target cannot be met otherwise.

export interface FoldRules {
  // A hub keeps its own overview node.
  keepHubs: boolean;
  // A shared terminal (terminalsOf) keeps its own overview node.
  keepTerminals: boolean;
  // Two targets of one decision's differently labelled branches never share
  // a group, unless the branches rejoin inside it.
  keepBranches: boolean;
  // The fewest nodes a T5 or T6 group hides.
  minHidden: number;
  // A T5 or T6 group never holds nodes of two prefix families (stageOf).
  keepFamilies: boolean;
}

export const STRICT: FoldRules = {
  keepHubs: true,
  keepTerminals: true,
  keepBranches: true,
  minHidden: 2,
  keepFamilies: true,
};

// Hubs and branches folded too. A group hiding one node is still undone or
// merged after the walk wherever that keeps the target.
export const LOOSE: FoldRules = {
  keepHubs: false,
  keepTerminals: false,
  keepBranches: false,
  minHidden: 2,
  keepFamilies: false,
};

// The rules a plan is walked with: strict first; then strict with prefix
// families mixed; then hubs and branches folded while shared terminals stay
// in view, first with prefix families kept apart, so a pipeline folds layer
// by layer (SLOP-0035), then mixed; then loose; and last, for a diagram no
// other walk plans, with groups hiding one node allowed too.
export const RELAXED: readonly FoldRules[] = [
  STRICT,
  { ...STRICT, keepFamilies: false },
  { ...LOOSE, keepTerminals: true, keepFamilies: true },
  { ...LOOSE, keepTerminals: true },
  LOOSE,
  { ...LOOSE, minHidden: 1 },
];

// A hub has degree at least four and at least the 90th percentile degree,
// by nearest rank over every node.
const HUB_DEGREE = 4;
const HUB_RANK = 0.9;

const hubCache = new WeakMap<WorkGraph, Set<string>>();

export const hubsOf = (work: WorkGraph): Set<string> => {
  const known = hubCache.get(work);
  if (known) return known;
  const degrees = work.ids
    .map((id) => work.degree.get(id) ?? 0)
    .sort((a, b) => a - b);
  const rank =
    degrees[Math.max(0, Math.ceil(HUB_RANK * degrees.length) - 1)] ?? 0;
  const least = Math.max(HUB_DEGREE, rank);
  const hubs = new Set(
    work.ids.filter((id) => (work.degree.get(id) ?? 0) >= least),
  );
  hubCache.set(work, hubs);
  return hubs;
};

// A shared terminal: a flowchart or state node that at least three other
// nodes lead into and that ends the flow, by directed edges only: it leads
// nowhere, or everything it leads to leads nowhere. A "Notify on-call" every
// failure ends at is one, a final state many paths reach is one, and so is a
// Cancelled state every failed payment reaches that leads only to the final
// Refunded and Voided. It ends many paths, so like a hub it keeps its own
// overview node; folded into one group it would read as that group's own end.
const TERMINAL_IN = 3;

const terminalCache = new WeakMap<WorkGraph, Set<string>>();

export const terminalsOf = (work: WorkGraph): Set<string> => {
  const known = terminalCache.get(work);
  if (known) return known;
  const into = new Map<string, Set<string>>();
  const next = new Map<string, Set<string>>();
  const out = new Set<string>();
  const undirected = new Set<string>();
  for (const e of work.edges.filter((edge) => edge.source !== edge.target)) {
    if (UNDIRECTED_KINDS.has(e.kind ?? "")) {
      out.add(e.source).add(e.target);
      undirected.add(e.source).add(e.target);
    } else out.add(e.source);
    into.set(e.target, new Set([...(into.get(e.target) ?? []), e.source]));
    next.set(e.source, new Set([...(next.get(e.source) ?? []), e.target]));
  }
  const ends = (id: string): boolean =>
    !out.has(id) ||
    (!undirected.has(id) &&
      [...(next.get(id) ?? [])].every((x) => !out.has(x)));
  const flow = work.family === "flowchart" || work.family === "state";
  const terminals = new Set(
    flow
      ? work.ids.filter(
          (id) => ends(id) && (into.get(id)?.size ?? 0) >= TERMINAL_IN,
        )
      : [],
  );
  terminalCache.set(work, terminals);
  return terminals;
};

// Whether one label reaches one target and another label the other.
const apart = (a: Set<string>, b: Set<string>): boolean =>
  [...a].some((x) => [...b].some((y) => x !== y));

// Whether a group of these members would hold two targets of one decision's
// differently labelled branches that do not rejoin inside the group. A group
// holding a whole decision region holds the decision's branches with it.
export const splitsBranches = (
  work: WorkGraph,
  members: readonly string[],
): boolean => {
  const inside = new Set(members);
  const whole = new Set(
    flowRegionsOf(work)
      .filter((r) => r.members.every((m) => inside.has(m)))
      .map((r) => r.head),
  );
  return decisionsOf(work).some(
    (d) => !whole.has(d.source) && splitsDecision(work, inside, d),
  );
};

const splitsDecision = (
  work: WorkGraph,
  inside: Set<string>,
  d: Decision,
): boolean => {
  const held = [...d.targets.keys()]
    .filter((t) => inside.has(t))
    .sort(byNatural);
  if (held.length < 2) return false;
  const topology = directedGraph(
    work.edges
      .filter((edge) => inside.has(edge.source) && inside.has(edge.target))
      .map((edge) => [edge.source, edge.target]),
    inside,
  );
  try {
    const reached = new Map<string, Set<string>>();
    const reach = (start: string): Set<string> => {
      const result =
        reached.get(start) ??
        new Set([start, ...reachableFrom(topology, start)]);
      reached.set(start, result);
      return result;
    };
    return separatedTargets(d, held, reach);
  } finally {
    topology.destroy();
  }
};

const separatedTargets = (
  decision: Decision,
  held: string[],
  reach: (id: string) => Set<string>,
): boolean => {
  return held.some((x, i) =>
    held.slice(i + 1).some((y) => {
      if (
        !apart(
          decision.targets.get(x) ?? new Set(),
          decision.targets.get(y) ?? new Set(),
        )
      )
        return false;
      const ry = reach(y);
      return ![...reach(x)].some((v) => ry.has(v));
    }),
  );
};
