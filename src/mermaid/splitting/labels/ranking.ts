import { directedGraph } from "../graph/directed.ts";
import type { WorkGraph } from "../graph/model.ts";
import { byNatural } from "../graph/order.ts";
import type { Group } from "../planning/state.ts";
import { UNDIRECTED_KINDS } from "../projection/quotient.ts";

const flowCache = new WeakMap<WorkGraph, Map<string, number>>();

// How many edges from where the flow enters each node sits: a breadth-first
// walk along edge directions from every node no edge enters, or a start
// marker leaves, or failing both the first node as a reader counts.
export const flowOrder = (work: WorkGraph): Map<string, number> => {
  const known = flowCache.get(work);

  if (known) {
    return known;
  }

  const entered = new Set(work.edges.filter((e) => e.source !== e.target).map((e) => e.target));
  const started = work.markerEdges.filter((e) => work.nodes.has(e.target)).map((e) => e.target);
  const roots = [...new Set([...work.ids.filter((id) => !entered.has(id)), ...started])].sort(byNatural);
  const starts = roots.length > 0 ? roots : work.ids.slice(0, 1);
  const depth = new Map<string, number>();
  const graph = directedGraph(
    work.edges.filter((e) => work.nodes.has(e.source) && work.nodes.has(e.target)).map((e) => [e.source, e.target]),
    work.ids,
  );

  try {
    graph.elements().bfs({
      roots: graph.nodes().filter((node) => starts.includes(node.data("originalId") as string)),
      directed: true,
      visit: (...visit) => {
        const [node, , , , distance] = visit;

        depth.set(node.data("originalId") as string, distance);
      },
    });
  } finally {
    graph.destroy();
  }

  flowCache.set(work, depth);

  return depth;
};

// The entries of a chain-like group in a flowchart or stateDiagram: its
// members, by the directed edges between them, form one path or several
// disjoint paths (twin chains), with at least one edge between members. The
// entries are the members no member leads into, where a reader enters each
// path. Null for any other group.
export const chainEntries = (work: WorkGraph, members: readonly string[]): string[] | null =>
  chainsOf(work, members)?.map((c) => c[0] as string) ?? null;

// The paths of a chain-like group, each from its entry in flow order.
export const chainsOf = (work: WorkGraph, members: readonly string[]): string[][] | null => {
  if (work.family !== "flowchart" && work.family !== "state") {
    return null;
  }

  const inside = new Set(members);
  const next = new Map<string, string>();
  const entered = new Set<string>();
  const internal = work.edges.filter(
    (edge) => edge.source !== edge.target && inside.has(edge.source) && inside.has(edge.target),
  );

  for (const e of internal) {
    if (UNDIRECTED_KINDS.has(e.kind ?? "") || next.has(e.source) || entered.has(e.target)) {
      return null;
    }

    next.set(e.source, e.target);
    entered.add(e.target);
  }

  if (next.size === 0) {
    return null;
  }

  const chains = members
    .filter((m) => !entered.has(m))
    .map((s) => {
      const path: string[] = [];

      for (let x: string | undefined = s; x !== undefined && path.length <= members.length; x = next.get(x)) {
        path.push(x);
      }

      return path;
    });

  return chains.reduce((n, c) => n + c.length, 0) === members.length ? chains : null;
};

// Each member by the edges crossing the group's boundary at it, either way, a
// start or end transition counted as one.
const crossingOf = (work: WorkGraph, members: readonly string[]): Map<string, number> => {
  const inside = new Set(members);
  const crossing = new Map<string, number>();
  const add = (id: string): void => {
    crossing.set(id, (crossing.get(id) ?? 0) + 1);
  };

  for (const e of work.edges) {
    if (inside.has(e.source) !== inside.has(e.target)) {
      add(inside.has(e.source) ? e.source : e.target);
    }
  }

  const markerEnds = work.markerEdges.flatMap((edge) => [edge.source, edge.target]);

  for (const end of markerEnds.filter((id) => inside.has(id))) {
    add(end);
  }

  return crossing;
};

// The members a group may be named after, best first. A chain stage is named
// after the member the flow reaches first, where the stage starts, and so is
// any chain-like group (chainEntries): after its entry, or for twin chains
// after the entry the flow reaches first, then the first by label, never a
// later stage. A suggested group (T5 or T6) is named after the member on its
// main path: the one with the most edges crossing the group's boundary, then
// the one the flow reaches first. Any other group is named after its
// best-connected member, the one of highest degree. Ties go to the smallest
// id as a reader counts.
export const rankedMembers = (work: WorkGraph, g: Pick<Group, "members" | "tier"> & { reason?: string }): string[] => {
  const flow = flowOrder(work);
  const at = (id: string): number => flow.get(id) ?? Number.POSITIVE_INFINITY;
  const labelOf = (id: string): string => work.nodes.get(id)?.label ?? id;

  if (g.reason === "chain stage") {
    return [...g.members].sort((a, b) => at(a) - at(b) || byNatural(a, b));
  }

  const entries = new Set(chainEntries(work, g.members) ?? []);

  if (entries.size > 0) {
    const entry = (id: string): number => (entries.has(id) ? 0 : 1);

    return [...g.members].sort(
      (a, b) => entry(a) - entry(b) || at(a) - at(b) || byNatural(labelOf(a), labelOf(b)) || byNatural(a, b),
    );
  }

  if (g.tier !== "T5" && g.tier !== "T6") {
    return [...g.members].sort((a, b) => (work.degree.get(b) ?? 0) - (work.degree.get(a) ?? 0) || byNatural(a, b));
  }

  const crossing = crossingOf(work, g.members);

  return [...g.members].sort(
    (a, b) => (crossing.get(b) ?? 0) - (crossing.get(a) ?? 0) || at(a) - at(b) || byNatural(a, b),
  );
};

// Whether an aggregate's root is a lookup: every edge it has joins one other
// member, as a LANGUAGE table hangs from FILM. Its name says little of the
// aggregate, whose edges all leave from the other members.
export const isLookup = (work: WorkGraph, root: string, members: readonly string[]): boolean => {
  const others = new Set(
    work.edges
      .filter((e) => e.source !== e.target && (e.source === root || e.target === root))
      .map((e) => (e.source === root ? e.target : e.source)),
  );
  const [only] = [...others];

  return others.size === 1 && only !== undefined && members.includes(only);
};

// An aggregate's members by the edges crossing its boundary, then degree.
export const byCrossing = (work: WorkGraph, members: readonly string[]): string[] => {
  const crossing = crossingOf(work, members);
  const degree = (id: string): number => work.degree.get(id) ?? 0;

  return [...members].sort(
    (a, b) => (crossing.get(b) ?? 0) - (crossing.get(a) ?? 0) || degree(b) - degree(a) || byNatural(a, b),
  );
};
