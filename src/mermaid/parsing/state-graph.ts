import { countedStateElements, stateParents } from "./adapters/graphs.ts";
import { type DiagramGraph, edgeIds, type GraphEdge, type GraphNode } from "./model.ts";

// State-specific containment, concurrent regions, and pseudostate projections.

type AnyDb = Record<string, unknown>;

interface StateNode {
  id?: string;
  label?: string;
  shape?: string;
  isGroup?: boolean;
  parentId?: string;
  description?: string[];
}
interface StateEdge {
  start?: string;
  end?: string;
  label?: string;
}

const STATE_MARKERS = new Set(["stateStart", "stateEnd"]);

// Each concurrency region of a composite, by the parser's id for it, named
// after the composite and its place among the composite's regions. The
// parser's ids are random, so a marker named after one would change name from
// one parse to the next.
const stateRegions = (db: AnyDb): { names: Map<string, string>; counts: Map<string, number> } => {
  const parentOf = stateParents(db);
  const names = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const n of (db.nodes as StateNode[] | undefined) ?? []) {
    if (n.shape !== "divider") {
      continue;
    }

    const composite = parentOf(n) ?? "root";
    const i = (counts.get(composite) ?? 0) + 1;

    counts.set(composite, i);
    names.set(n.id ?? "", `${composite}_region${i}`);
  }

  return { names, counts };
};

// A marker's id with the region it is named after renamed, as in Active_region2_start.
const markerRename = (names: Map<string, string>): ((id: string) => string) => {
  const byLength = [...names].sort((a, b) => b[0].length - a[0].length);

  return (id) => {
    const hit = byLength.find(([region]) => id.startsWith(`${region}_`));

    return hit ? `${hit[1]}${id.slice(hit[0].length)}` : id;
  };
};

function reserveName(reserved: Set<string | undefined>, candidate: string): string {
  let name = candidate;

  while (reserved.has(name)) {
    name += "_";
  }

  reserved.add(name);

  return name;
}

function markerNames(markers: StateNode[], counted: StateNode[], regions: Map<string, string>): Map<string, string> {
  const reserved = new Set(counted.map((node) => node.id));
  const rename = markerRename(regions);

  return new Map(
    markers.map((node) => {
      const id = node.id ?? "";

      return [id, reserveName(reserved, rename(id))];
    }),
  );
}

// The start and end markers, and each transition into or out of one. They are
// kept apart from what stats.ts counts, so a reader of the graph still sees
// where a path begins and ends. Notes, and their connectors, are dropped. A
// marker in a concurrency region sits in the composite, as its states do.
const stateMarkers = (db: AnyDb, counted: StateNode[]): { nodes: StateNode[]; edges: StateEdge[] } => {
  const parentOf = stateParents(db);
  const raw = ((db.nodes as StateNode[] | undefined) ?? []).filter((n) => STATE_MARKERS.has(n.shape ?? ""));
  const names = markerNames(raw, counted, stateRegions(db).names);
  const rename = (id: string): string => names.get(id) ?? id;
  const nodes = raw.map((n) => ({
    ...n,
    id: rename(n.id ?? ""),
    label: rename(n.label ?? ""),
    parentId: parentOf(n),
  }));
  const markers = new Set(nodes.map((n) => n.id ?? ""));
  const drawn = new Set([...markers, ...counted.map((n) => n.id ?? "")]);
  const edges = ((db.edges as StateEdge[] | undefined) ?? [])
    .map((e) => ({
      ...e,
      start: rename(e.start ?? ""),
      end: rename(e.end ?? ""),
    }))
    .filter((e) => (markers.has(e.start) || markers.has(e.end)) && drawn.has(e.start) && drawn.has(e.end));

  return { nodes, edges };
};

// The states and transitions stats.ts counts, without start and end markers or
// notes. A composite state is both a node and the subgraph that holds its
// children, as the stats count it; the node is named apart from its box, since
// cytoscape cannot draw one element as both.
function stateGroupNames(nodes: StateNode[], markers: StateNode[]): Map<string, string> {
  const reserved = new Set([...nodes, ...markers].map((node) => node.id));
  const names = new Map<string, string>();

  for (const node of nodes.filter((item) => item.isGroup)) {
    const id = node.id ?? "";

    names.set(id, reserveName(reserved, `${id}__group`));
  }

  return names;
}

export const stateGraph = (type: string, db: AnyDb): DiagramGraph => {
  const { nodes, edges } = countedStateElements<StateNode, StateEdge>(db);
  const markers = stateMarkers(db, nodes);
  const groupNames = stateGroupNames(nodes, markers.nodes);
  const groupId = (id: string): string => groupNames.get(id) ?? id;
  const groups = new Set(nodes.filter((n) => n.isGroup).map((n) => n.id ?? ""));
  const { counts } = stateRegions(db);
  const regions = (n: StateNode): { regions?: number } => {
    const count = counts.get(n.id ?? "") ?? 0;

    return count > 1 ? { regions: count } : {};
  };

  const parentOf = (n: StateNode): string | null => (n.parentId && groups.has(n.parentId) ? groupId(n.parentId) : null);
  const node = (n: StateNode): GraphNode => ({
    id: n.id ?? "",
    label: n.label ?? n.id ?? "",
    parent: n.isGroup ? groupId(n.id ?? "") : parentOf(n),
    ...(n.shape ? { shape: n.shape } : {}),
    ...(n.description?.length ? { descriptions: [...n.description] } : {}),
  });
  const id = edgeIds();
  const edge = (e: StateEdge): GraphEdge => {
    const [source, target] = [e.start ?? "", e.end ?? ""];

    return {
      id: id(source, target),
      source,
      target,
      ...(e.label ? { label: e.label } : {}),
    };
  };

  return {
    diagram_type: type,
    nodes: nodes.map(node),
    edges: edges.map(edge),
    subgraphs: nodes
      .filter((n) => n.isGroup)
      .map((n) => ({
        id: groupId(n.id ?? ""),
        owner: n.id ?? "",
        label: "",
        parent: parentOf(n),
        ...regions(n),
      })),
    pseudo: { nodes: markers.nodes.map(node), edges: markers.edges.map(edge) },
  };
};
