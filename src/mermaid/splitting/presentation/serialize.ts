import type { DiagramGraph, GraphEdge, GraphNode } from "../../parsing/graph.ts";
import { directedGraph, nodeKey } from "../graph/directed.ts";
import type { Family } from "../graph/model.ts";
import { byId, byNatural, edgeOrder, ranked, startOrder } from "../graph/order.ts";
import { quoted, quoteLabel, sourceEntities, tail } from "../labels/text.ts";

const STUB_STYLE = "classDef stub stroke-dasharray:4";
const GROUP_STYLE = "classDef group stroke-width:3px,stroke-dasharray:6 3";

const BRACKETS: Record<string, [string, string]> = {
  square: ["[", "]"],
  round: ["(", ")"],
  stadium: ["([", "])"],
  subroutine: ["[[", "]]"],
  cylinder: ["[(", ")]"],
  circle: ["((", "))"],
  doublecircle: ["(((", ")))"],
  odd: [">", "]"],
  diamond: ["{", "}"],
  hexagon: ["{{", "}}"],
  lean_right: ["[/", "/]"],
  lean_left: ["[\\", "\\]"],
  trapezoid: ["[/", "\\]"],
  inv_trapezoid: ["[\\", "/]"],
};

export interface Scene {
  graph: DiagramGraph;
  stubs: ReadonlySet<string>;
  groups?: ReadonlySet<string>;
}

interface OrderedScene extends Scene {
  owners: Map<string, string>;
  byNode: (a: { id: string }, b: { id: string }) => number;
  byEdge: (a: GraphEdge, b: GraphEdge) => number;
  edges: GraphEdge[];
}

const pad = (depth: number): string => "  ".repeat(depth + 1);

// Each node's place in reading order: a breadth-first walk along the edges
// from every node nothing enters, then from whatever is left, each step in
// natural order of ids. It reads the graph alone, so statement order never
// reaches it.
const readingOrder = (scene: Scene): Map<string, number> => {
  const { graph } = scene;
  const ids = startOrder(graph, scene.stubs);
  const edges = [...graph.edges, ...(graph.pseudo?.edges ?? [])];
  const entered = new Set<string>();

  for (const e of edges) {
    if (e.source !== e.target) {
      entered.add(e.target);
    }
  }

  const rank = new Map<string, number>();
  const topology = directedGraph(
    edges.map((e) => [e.source, e.target] as const).sort((a, b) => byNatural(a[0], b[0]) || byNatural(a[1], b[1])),
    ids,
  );

  try {
    for (const id of [...ids.filter((x) => !entered.has(x)), ...ids]) {
      if (rank.has(id)) {
        continue;
      }

      topology.elements().bfs({
        roots: topology.getElementById(nodeKey(id)),
        directed: true,
        visit: (node) => {
          const original = node.data("originalId") as string;

          if (!rank.has(original)) {
            rank.set(original, rank.size);
          }
        },
      });
    }
  } finally {
    topology.destroy();
  }

  return rank;
};

const childrenIn = (
  { graph, byNode, owners }: OrderedScene,
  scope: string | null,
): { nodes: GraphNode[]; boxes: GraphNode[] } => ({
  nodes: graph.nodes.filter((n) => n.parent === scope && n.id !== owners.get(scope ?? "")).sort(byNode),
  boxes: graph.subgraphs.filter((s) => s.parent === scope).sort(byNode),
});

// A shape with no bracket is written in mermaid's shape data, whose label is
// always read as markdown, so a plain label is written only when it is the id.
const shapeData = (n: GraphNode): string => {
  if (n.markdown) {
    return `${n.id}@{ shape: ${n.shape}, label: "${sourceEntities(n.label)}" }`;
  }

  return n.label === n.id
    ? `${n.id}@{ shape: ${n.shape} }`
    : `${n.id}@{ shape: ${n.shape}, label: "${quoteLabel(n.label)}" }`;
};

const flowNode = (n: GraphNode): string => {
  const bracket = BRACKETS[n.shape ?? "square"];

  return bracket ? `${n.id}${bracket[0]}${quoted(n.label, n.markdown)}${bracket[1]}` : shapeData(n);
};

const flowScope = (scene: OrderedScene, scope: string | null, depth: number): string[] => {
  const { nodes, boxes } = childrenIn(scene, scope);

  return [
    ...nodes.map((n) => `${pad(depth)}${flowNode(n)}`),
    ...boxes.flatMap((b) => [
      `${pad(depth)}subgraph ${b.id}[${quoted(b.label, b.markdown)}]`,
      ...flowScope(scene, b.id, depth + 1),
      `${pad(depth)}end`,
    ]),
  ];
};

const flowEdge = (e: GraphEdge): string => {
  const kind = e.kind ?? "-->";
  const label = e.label && kind !== "~~~" ? `|${quoted(e.label, e.markdown)}|` : "";

  return `${pad(0)}${e.source} ${kind}${label} ${e.target}`;
};

const classLines = (ids: ReadonlySet<string> | undefined, name: string, style: string): string[] =>
  !ids || ids.size === 0 ? [] : [`${pad(0)}${style}`, `${pad(0)}class ${[...ids].sort(byNatural).join(",")} ${name}`];

const styleLines = (scene: Scene, groups: boolean): string[] => [
  ...classLines(scene.stubs, "stub", STUB_STYLE),
  ...(groups ? classLines(scene.groups, "group", GROUP_STYLE) : []),
];

// The lines a diagram opens with: its keyword, and the direction the source
// was parsed with. A flowchart names it on the keyword line.
export interface Head {
  family: Family;
  type: string;
  direction: string;
}

const headLines = (head: Head, keyword: string): string[] => {
  if (head.family === "flowchart") {
    return [`${head.type === "flowchart-elk" ? "flowchart-elk" : "flowchart"} ${head.direction || "TB"}`];
  }

  return [keyword, ...(head.direction && head.direction !== "TB" ? [`${pad(0)}direction ${head.direction}`] : [])];
};

const emitFlowchart = (head: Head, scene: OrderedScene): string =>
  [
    ...headLines(head, ""),
    ...flowScope(scene, null, 0),
    ...scene.edges.map(flowEdge),
    ...styleLines(scene, false),
  ].join("\n");

const STATE_PSEUDO = new Set(["choice", "fork", "join"]);

// A state, then each description line under its name. A state with a
// description names itself in quotes even when its name is its id, since
// stateDb takes the first `id : text` line as the name otherwise.
const stateNode = (n: GraphNode): string[] => {
  if (STATE_PSEUDO.has(n.shape ?? "")) {
    return [`state ${n.id} <<${n.shape}>>`];
  }

  const lines = (n.descriptions ?? []).map((d) => `${n.id}${tail(d)}`);

  if (n.label === n.id && lines.length === 0) {
    return [n.id];
  }

  return [`state ${quoted(n.label, undefined)} as ${n.id}`, ...lines];
};

// A start or end transition, with its label, inside the box its marker sits in.
const markerLines = (scene: OrderedScene, scope: string | null, depth: number): string[] => {
  const { graph } = scene;
  const markers = new Map((graph.pseudo?.nodes ?? []).map((m) => [m.id, m]));

  return [...(graph.pseudo?.edges ?? [])].sort(scene.byEdge).flatMap((e) => {
    const start = markers.get(e.source);
    const end = markers.get(e.target);

    if (start && start.parent === scope) {
      return [`${pad(depth)}[*] --> ${e.target}${tail(e.label)}`];
    }

    if (end && end.parent === scope) {
      return [`${pad(depth)}${e.source} --> [*]${tail(e.label)}`];
    }

    return [];
  });
};

const stateScope = (scene: OrderedScene, scope: string | null, depth: number): string[] => {
  const { nodes, boxes } = childrenIn(scene, scope);
  const { graph } = scene;
  const labelOf = new Map(graph.nodes.map((n) => [n.id, n.label]));

  return [
    ...nodes.flatMap((n) => stateNode(n).map((line) => `${pad(depth)}${line}`)),
    ...boxes.flatMap((b) => {
      const owner = b.owner ?? b.id;
      const label = labelOf.get(owner) ?? owner;
      const head = label === owner ? `state ${owner} {` : `state ${quoted(label, undefined)} as ${owner} {`;

      return [`${pad(depth)}${head}`, ...stateScope(scene, b.id, depth + 1), `${pad(depth)}}`];
    }),
    ...markerLines(scene, scope, depth),
  ];
};

const stateEdge = (e: GraphEdge): string => `${pad(0)}${e.source} --> ${e.target}${tail(e.label)}`;

const emitState = (head: Head, scene: OrderedScene): string =>
  [
    ...headLines(head, "stateDiagram-v2"),
    ...stateScope(scene, null, 0),
    ...scene.edges.map(stateEdge),
    ...styleLines(scene, true),
  ].join("\n");

// A node's rows in braces after its declaration, one per line.
const withRows = (decl: string, n: GraphNode, depth: number): string[] =>
  n.rows?.length
    ? [`${pad(depth)}${decl} {`, ...n.rows.map((r) => `${pad(depth + 1)}${r}`), `${pad(depth)}}`]
    : [`${pad(depth)}${decl}`];

const entity = (n: GraphNode): string[] =>
  withRows(n.label === n.id ? n.id : `${n.id}[${quoted(n.label, undefined)}]`, n, 0);

const relationship = (e: GraphEdge): string =>
  `${pad(0)}${e.source} ${e.cardinality ?? "||--||"} ${e.target} : ${quoted(e.label ?? "", undefined)}`;

const emitEr = (head: Head, scene: OrderedScene): string =>
  [
    ...headLines(head, "erDiagram"),
    ...[...scene.graph.nodes].sort(scene.byNode).flatMap(entity),
    ...scene.edges.map(relationship),
    ...styleLines(scene, true),
  ].join("\n");

const classDecl = (n: GraphNode, depth: number): string[] =>
  withRows(n.label === n.id ? `class ${n.id}` : `class ${n.id}[${quoted(n.label, undefined)}]`, n, depth);

// A relation an overview merges from relations of several kinds carries none,
// and is drawn as a plain directed association, the way the overview reads.
const classEdge = (e: GraphEdge, names: Map<string, string>): string => {
  const [a, b] = [names.get(e.source) ?? e.source, names.get(e.target) ?? e.target];

  return `${pad(0)}${a} ${e.cardinality ?? e.kind ?? "-->"} ${b}${tail(e.label)}`;
};

const annotations = (ids: ReadonlySet<string> | undefined, name: string): string[] =>
  [...(ids ?? [])].sort(byNatural).map((s) => `${pad(0)}<<${name}>> ${s}`);

// Each namespace holding a class as its own block under its full id; mermaid
// nests a dotted id inside the namespace it names, and makes each namespace
// around it, so one holding only namespaces needs no block.
const emitClass = (head: Head, scene: OrderedScene): string => {
  const { graph } = scene;
  const names = new Map((graph.pseudo?.nodes ?? []).map((p) => [p.id, p.label]));
  const spaces = [...graph.subgraphs].sort(byId);

  return [
    ...headLines(head, "classDiagram"),
    ...spaces.flatMap((s) => {
      const inside = graph.nodes.filter((n) => n.parent === s.id).sort(scene.byNode);

      if (inside.length === 0) {
        return [];
      }

      return [`${pad(0)}namespace ${s.id} {`, ...inside.flatMap((n) => classDecl(n, 1)), `${pad(0)}}`];
    }),
    ...graph.nodes
      .filter((n) => n.parent === null)
      .sort(scene.byNode)
      .flatMap((n) => classDecl(n, 0)),
    ...annotations(scene.stubs, "stub"),
    ...annotations(scene.groups, "group"),
    ...scene.edges.map((e) => classEdge(e, names)),
  ].join("\n");
};

export const emitSource = (head: Head, scene: Scene): string => {
  const rank = readingOrder(scene);
  const byEdge = edgeOrder(rank);
  const ordered: OrderedScene = {
    ...scene,
    owners: new Map(scene.graph.subgraphs.flatMap((box) => (box.owner === undefined ? [] : [[box.id, box.owner]]))),
    byNode: ranked(rank),
    byEdge,
    edges: [...scene.graph.edges].sort(byEdge),
  };

  if (head.family === "flowchart") {
    return emitFlowchart(head, ordered);
  }

  if (head.family === "state") {
    return emitState(head, ordered);
  }

  if (head.family === "er") {
    return emitEr(head, ordered);
  }

  return emitClass(head, ordered);
};
