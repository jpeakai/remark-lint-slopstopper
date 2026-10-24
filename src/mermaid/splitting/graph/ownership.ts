import {
  createGraph,
  type Graph,
  getAncestors,
  getDescendants,
} from "@statelyai/graph";
import { getStronglyConnectedComponents } from "@statelyai/graph/algorithms";
import type { GraphEdge } from "../../parsing/graph.ts";
import { nodeKey } from "./directed.ts";
import type { WorkGraph } from "./model.ts";
import { byText } from "./order.ts";

// erDiagram aggregates: which entity owns which, the root each ownership
// chain ends at, and the junctions between two roots.

const ONE = "ONLY_ONE";
// What a dependent's own end may be: many, or at most one.
const DEPENDENT = new Set(["ONE_OR_MORE", "ZERO_OR_MORE", "ZERO_OR_ONE"]);

// The parent an edge makes of one end, with exactly one at the parent's end.
const parentLink = (e: GraphEdge): { parent: string; child: string } | null => {
  if (!e.ends || e.source === e.target) return null;
  const { from, to } = e.ends;
  if (from === ONE && DEPENDENT.has(to))
    return { parent: e.source, child: e.target };
  if (to === ONE && DEPENDENT.has(from))
    return { parent: e.target, child: e.source };
  return null;
};

const identifyingParents = (work: WorkGraph): Map<string, Set<string>> => {
  const parents = new Map<string, Set<string>>();
  for (const e of work.edges) {
    const link = e.identifying ? parentLink(e) : null;
    if (link)
      parents.set(
        link.child,
        new Set([...(parents.get(link.child) ?? []), link.parent]),
      );
  }
  return parents;
};

interface Ownership {
  parents: Map<string, Set<string>>;
  owners: Map<string, string>;
  hierarchy: Graph<string>;
}

const ownerCache = new WeakMap<WorkGraph, Ownership>();

// An entity's owner: its one identifying parent, or, with none, the entity a
// leaf relates to with exactly one at that end.
const ownerOf = (
  work: WorkGraph,
  identified: Map<string, Set<string>>,
  id: string,
): string | undefined => {
  const parents = identified.get(id);
  if (parents) return parents.size === 1 ? [...parents][0] : undefined;
  const touching = work.edges.filter((e) => e.source === id || e.target === id);
  const leaf =
    touching.length === 1 ? parentLink(touching[0] as GraphEdge) : null;
  return leaf?.child === id ? leaf.parent : undefined;
};

// Breaks each cycle of owners at the smallest id on it.
const breakCycles = (owners: Map<string, string>): void => {
  const graph = createGraph<string>({
    nodes: [...new Set([...owners.keys(), ...owners.values()])].map((id) => ({
      id: nodeKey(id),
      data: id,
    })),
    edges: [...owners].map(([sourceId, targetId], id) => ({
      id: String(id),
      sourceId: nodeKey(sourceId),
      targetId: nodeKey(targetId),
    })),
  });
  for (const component of getStronglyConnectedComponents(graph))
    if (component.length > 1)
      owners.delete(
        component.map((node) => node.data).sort(byText)[0] as string,
      );
};

// Cardinality policy chooses ownership; the library indexes its forest.
const ownershipOf = (work: WorkGraph): Ownership => {
  const known = ownerCache.get(work);
  if (known) return known;
  const owners = new Map<string, string>();
  const identified = identifyingParents(work);
  for (const id of work.ids) {
    const owner = ownerOf(work, identified, id);
    if (owner !== undefined && owner !== id) owners.set(id, owner);
  }
  breakCycles(owners);
  const model = {
    owners,
    parents: identified,
    hierarchy: createGraph<string>({
      nodes: work.ids.map((id) => ({
        id: nodeKey(id),
        data: id,
        parentId: owners.has(id) ? nodeKey(owners.get(id) as string) : null,
      })),
    }),
  };
  ownerCache.set(work, model);
  return model;
};

export const ownersOf = (work: WorkGraph): Map<string, string> =>
  ownershipOf(work).owners;

export const rootOf = (work: WorkGraph, id: string): string => {
  return (
    getAncestors(ownershipOf(work).hierarchy, nodeKey(id)).at(-1)?.data ?? id
  );
};

// An entity identified by two entities or more that lie in different
// aggregates: a junction between two roots.
export const isJunction = (work: WorkGraph, id: string): boolean => {
  if (work.family !== "er") return false;
  const parents = ownershipOf(work).parents.get(id);
  return (
    parents !== undefined &&
    new Set([...parents].map((p) => rootOf(work, p))).size >= 2
  );
};

// The aggregate an entity heads: itself and everything it owns.
export const aggregateOf = (work: WorkGraph, head: string): string[] => {
  const members = new Set([
    head,
    ...getDescendants(ownershipOf(work).hierarchy, nodeKey(head)).map(
      (node) => node.data,
    ),
  ]);
  return work.ids.filter((id) => members.has(id));
};
