import type { ClassDB } from "mermaid/dist/diagrams/class/classDb.js";
import type { ErDB } from "mermaid/dist/diagrams/er/erDb.js";
import type { FlowDB } from "mermaid/dist/diagrams/flowchart/flowDb.js";
import { type AnyDb, architectureDepth, type Structure } from "../model.ts";

export function adaptFlowchart(db: AnyDb): Structure {
  const flow = db as unknown as FlowDB;
  const vertices = flow.getVertices();
  const edgesArr = flow.getEdges();
  const subGraphs = flow.getSubGraphs();

  return {
    nodeIds: flowchartNodeIds(vertices.keys(), subGraphs),
    edges: edgesArr.length,
    subgraphNames: subGraphs.map((s) => s.title ?? s.id ?? ""),
    maxDepth: subgraphNestingDepth(subGraphs),
  };
}

// An edge to a subgraph's id (`A --> S`) leaves a vertex named S in the db, but
// mermaid draws that edge to the subgraph's box and draws no node S. So a
// vertex that shares a subgraph's id is the subgraph, not a node.
export const flowchartNodeIds = (ids: Iterable<string>, subGraphs: Array<{ id?: string }>): string[] => {
  const boxes = new Set(subGraphs.map((s) => s.id));

  return [...ids].filter((id) => !boxes.has(id));
};

export function adaptClass(db: AnyDb): Structure {
  const classesDb = db as unknown as ClassDB;
  const classes = classesDb.getClasses();
  const relations = classesDb.getRelations();
  const namespaces = classesDb.getNamespaces();
  const groups = [...namespaces].map(([id, ns]) => ({
    id,
    in: ns.parent,
    label: ns.label || id,
  }));
  let rows = 0;

  for (const c of classes.values()) {
    rows += c.members.length + c.methods.length;
  }

  return {
    nodeIds: [...classes.keys()],
    edges: relations.length,
    subgraphNames: groups.map((g) => g.label),
    maxDepth: architectureDepth(groups),
    rows,
  };
}

export function adaptEr(db: AnyDb): Structure {
  const er = db as unknown as ErDB;
  const entities = er.getEntities();
  const relationships = er.getRelationships();
  let rows = 0;

  for (const e of entities.values()) {
    rows += e.attributes.length;
  }

  return {
    nodeIds: [...entities.keys()],
    edges: relationships.length,
    subgraphNames: [],
    maxDepth: 0,
    rows,
  };
}

interface StateNode {
  id?: string;
  type?: string;
  shape?: string;
  isGroup?: boolean;
  parentId?: string;
}
interface StateEdge {
  start?: string;
  end?: string;
}

// The shapes stateDb gives what is not a state: the start and end markers
// ([*], one pair per composite state), and a note with the group mermaid wraps
// it in. A marker only says where a path begins or ends, and a note is an
// annotation, as notes are in every other type.
//
// A divider is one concurrency region of a composite state, the part between
// two `--` lines. Mermaid draws it as an unlabelled area of the composite's
// box, set off from the next region by a dashed line, with no box or title of
// its own. The composite is the boundary the reader finds and tracks, and the
// dashed line only divides it, as `and` divides a sequence `par` block that
// counts once. So a region is neither a state nor a subgraph, and the states
// in it belong to the composite. Its id is also random, so counting it would
// change the node and subgraph names from one parse to the next.
const STATE_DIVIDER = "divider";
const STATE_NOT_A_STATE = new Set(["stateStart", "stateEnd", "note", "noteGroup", STATE_DIVIDER]);

const isCountedState = (n: { shape?: string }): boolean => !STATE_NOT_A_STATE.has(n.shape ?? "");

// Each state's parent with concurrency regions passed over, so a state in a
// region has the composite around the region as its parent.
export const stateParents = (db: AnyDb): ((n: StateNode) => string | undefined) => {
  const all = (db.nodes as StateNode[] | undefined) ?? [];
  const dividers = new Map(all.filter((n) => n.shape === STATE_DIVIDER).map((n) => [n.id ?? "", n.parentId]));

  return (n) => {
    let parent = n.parentId;
    const seen = new Set<string>();

    while (parent !== undefined && dividers.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      parent = dividers.get(parent);
    }

    return parent;
  };
};

// The states and transitions a stateDiagram draws, without markers, notes or
// concurrency regions, each with its parent read past any region. A
// transition into or out of a marker goes with it, as does a note's
// connector. graph.ts draws the same set, so the two never disagree.
export const countedStateElements = <N extends StateNode, E extends StateEdge>(
  db: AnyDb,
): { nodes: N[]; edges: E[] } => {
  const all = (db.nodes as N[] | undefined) ?? [];
  const parentOf = stateParents(db);
  const nodes = all.filter(isCountedState).map((n) => {
    const parentId = parentOf(n);
    const { parentId: _, ...rest } = n;

    return (parentId === undefined ? rest : { ...rest, parentId }) as N;
  });
  const kept = new Set(nodes.map((n) => n.id ?? ""));
  const edges = ((db.edges as E[] | undefined) ?? []).filter((e) => kept.has(e.start ?? "") && kept.has(e.end ?? ""));

  return { nodes, edges };
};

// A composite state (`state A { ... }`) is a group that holds other states,
// so it counts as a subgraph too, and its nesting depth is read from each
// state's parentId chain. It stays a node as well, because it is drawn as a
// labelled state.
export function adaptState(db: AnyDb): Structure {
  // stateDiagram db exposes data on direct properties.
  const { nodes, edges } = countedStateElements<StateNode, StateEdge>(db);
  const groups = nodes.filter((n) => n.isGroup === true);
  const parent = (node: StateNode): { id?: string; in?: string } => ({
    id: node.id,
    in: node.parentId,
  });

  return {
    nodeIds: nodes.map((n) => n.id ?? ""),
    edges: edges.length,
    subgraphNames: groups.map((g) => g.id ?? ""),
    maxDepth: architectureDepth(groups.map(parent), nodes.map(parent)),
  };
}

function subgraphNestingDepth(subGraphs: Array<{ id?: string; nodes?: string[] }>): number {
  if (subGraphs.length === 0) {
    return 0;
  }

  const idToMembers = new Map<string, Set<string>>();

  for (const sg of subGraphs) {
    if (sg.id) {
      idToMembers.set(sg.id, new Set(sg.nodes ?? []));
    }
  }

  let max = 1;
  const depthOf = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) {
      return 1;
    }

    seen.add(id);

    let d = 1;

    for (const [otherId, members] of idToMembers) {
      if (otherId !== id && members.has(id)) {
        d = Math.max(d, 1 + depthOf(otherId, seen));
      }
    }

    return d;
  };

  for (const id of idToMembers.keys()) {
    max = Math.max(max, depthOf(id, new Set()));
  }

  return max;
}
