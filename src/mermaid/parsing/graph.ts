import type { ClassDB } from "mermaid/dist/diagrams/class/classDb.js";
import type { ClassMember, ClassNode, ClassRelation } from "mermaid/dist/diagrams/class/classTypes.js";
import type { ErDB } from "mermaid/dist/diagrams/er/erDb.js";
import type { Attribute as ErAttribute, Relationship as ErRelationship } from "mermaid/dist/diagrams/er/erTypes.js";
import type { FlowDB } from "mermaid/dist/diagrams/flowchart/flowDb.js";
import type { FlowEdge } from "mermaid/dist/diagrams/flowchart/types.js";
import type { MindmapDB } from "mermaid/dist/diagrams/mindmap/mindmapDb.js";
import type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";
import type { Message as SequenceRecord } from "mermaid/dist/diagrams/sequence/types.js";
import { flowchartNodeIds } from "./adapters/graphs.ts";
import { isSequenceMessage, type SequenceCodes, sequenceCodes } from "./adapters/sequence.ts";
import { getMermaidCore, memoBySource } from "./engine.ts";
import { type DiagramGraph, edgeIds, type GraphEdge, type GraphNode, walkTree } from "./model.ts";
import { stateGraph } from "./state-graph.ts";

export type { DiagramGraph, GraphEdge, GraphNode } from "./model.ts";

// The element-level structure of a diagram, read from mermaid's parser result:
// each node, each edge and each subgraph, with what contains what. The stats in
// stats.ts count the same result, and this keeps the elements themselves, so
// the docs site can draw what the parser returned beside the score it earns.
// Only the types read below are read, and any other type throws.

type AnyDb = Record<string, unknown>;

// flowDb names a label written in backticks a markdown label.
const markdownOf = (x: { labelType?: string }): { markdown?: true } =>
  x.labelType === "markdown" ? { markdown: true } : {};

// The parser splits a link into a stroke and an arrow type, and the kind puts
// them back as the source spells them. A stretched link (`--->`) only spaces
// the layout, so its length is not kept.
const FLOW_LINE: Record<string, { arrowed: string; open: string }> = {
  normal: { arrowed: "--", open: "---" },
  dotted: { arrowed: "-.-", open: "-.-" },
  thick: { arrowed: "==", open: "===" },
};
const FLOW_HEAD: Record<string, string> = {
  point: ">",
  circle: "o",
  cross: "x",
};
const FLOW_TAIL: Record<string, string> = {
  point: "<",
  circle: "o",
  cross: "x",
};

const flowKind = (e: FlowEdge): string => {
  if (e.stroke === "invisible") {
    return "~~~";
  }

  const line = FLOW_LINE[e.stroke ?? ""];
  const arrow = /^(double_)?arrow_(point|circle|cross|open)$/.exec(e.type ?? "");

  if (!(line && arrow)) {
    throw new Error(`no kind for the flowchart link ${e.stroke} ${e.type}`);
  }

  const head = arrow[2] ?? "";

  if (head === "open") {
    return line.open;
  }

  return `${arrow[1] ? FLOW_TAIL[head] : ""}${line.arrowed}${FLOW_HEAD[head]}`;
};

// Mermaid lists each member once, under its innermost subgraph, and a nested
// subgraph is listed by id as a member of the one around it. An edge may end
// at a subgraph's id, and then it runs to the subgraph, as stats.ts counts it.
const flowchartGraph = (type: string, db: AnyDb): DiagramGraph => {
  const flow = db as unknown as FlowDB;
  const vertices = [...flow.getVertices().values()];
  const edges = flow.getEdges();
  const subGraphs = flow.getSubGraphs();
  const parentOf = new Map<string, string>();

  for (const sg of subGraphs) {
    for (const member of sg.nodes ?? []) {
      parentOf.set(member, sg.id);
    }
  }

  const kept = new Set(
    flowchartNodeIds(
      vertices.map((v) => v.id),
      subGraphs,
    ),
  );
  const id = edgeIds();

  return {
    diagram_type: type,
    nodes: vertices
      .filter((v) => kept.has(v.id))
      .map((v) => ({
        id: v.id,
        label: v.text ?? v.id,
        parent: parentOf.get(v.id) ?? null,
        shape: v.type ?? "square",
        ...markdownOf(v),
      })),
    edges: edges.map((e) => ({
      id: e.id ?? id(e.start, e.end),
      source: e.start,
      target: e.end,
      kind: flowKind(e),
      ...(e.text ? { label: e.text, ...markdownOf(e) } : {}),
    })),
    subgraphs: subGraphs.map((sg) => ({
      id: sg.id,
      label: sg.title ?? sg.id,
      parent: parentOf.get(sg.id) ?? null,
      ...markdownOf(sg),
    })),
  };
};

// A mindmap's labels may repeat, so each entry uses the parser's numeric id.
const mindmapGraph = (type: string, db: AnyDb): DiagramGraph => {
  const root = (db as unknown as MindmapDB).getMindmap();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeId = edgeIds();

  for (const { node, parent } of walkTree(root)) {
    const id = `n${node.id}`;

    nodes.push({ id, label: node.descr, parent: null });

    if (parent) {
      const source = `n${parent.id}`;

      edges.push({ id: edgeId(source, id), source, target: id });
    }
  }

  return { diagram_type: type, nodes, edges, subgraphs: [] };
};

// A participant is a node, and a message an edge between two. A box holds its
// participants. A block (loop, alt, opt, par and the rest) frames messages,
// not participants, so it holds no node; it is drawn as an empty boundary,
// inside the block around it.
const sequenceGraph = (type: string, db: AnyDb): DiagramGraph => {
  const sequence = db as unknown as SequenceDB;
  const actors = sequence.getActors();
  const boxes = sequence.getBoxes();
  const messages = sequence.getMessages();
  const boxId = (i: number): string => `box_${i}`;
  const subgraphs: GraphNode[] = boxes.map((b, i) => ({
    id: boxId(i),
    label: b.name || boxId(i),
    parent: null,
  }));
  const nodes: GraphNode[] = [...actors].map(([id, a]) => {
    const i = a.box ? boxes.indexOf(a.box) : -1;

    return { id, label: a.description ?? id, parent: i >= 0 ? boxId(i) : null };
  });
  const id = edgeIds();
  const codes = sequenceCodes(db);
  const edges = messages
    .filter((r) => isSequenceMessage(codes, r))
    .map((r) => {
      const [source, target] = [r.from as string, r.to as string];

      return { id: id(source, target), source, target };
    });
  const blocks = sequenceBlocks(codes, messages, subgraphs.length);

  return {
    diagram_type: type,
    nodes,
    edges,
    subgraphs: [...subgraphs, ...blocks],
  };
};

// Each block in statement order, inside the block open around it. Ids number
// on from the boxes, so a block and a box never share one.
const sequenceBlocks = (codes: SequenceCodes, records: SequenceRecord[], first: number): GraphNode[] => {
  const blocks: GraphNode[] = [];
  const open: string[] = [];

  for (const r of records) {
    if (r.type === undefined) {
      continue;
    }

    if (codes.open.has(r.type)) {
      const id = `block_${first + blocks.length}`;
      const label = sequenceBlockLabel(r, id);

      blocks.push({ id, label, parent: open[open.length - 1] ?? null });
      open.push(id);
    } else if (codes.close.has(r.type)) {
      open.pop();
    }
  }

  return blocks;
};

const sequenceBlockLabel = (record: SequenceRecord, fallback: string): string =>
  typeof record.message === "string" && record.message ? record.message : fallback;

const erRow = (a: ErAttribute): string =>
  [
    a.type ?? "",
    a.name ?? "",
    ...(a.keys?.length ? [a.keys.join(", ")] : []),
    ...(a.comment ? [`"${a.comment}"`] : []),
  ].join(" ");

const rowsOf = (rows: string[]): { rows?: string[] } => (rows.length > 0 ? { rows } : {});
const enumValue = <T>(db: AnyDb, table: string, name: string): T => {
  const value = (db[table] as Readonly<Record<string, unknown>> | undefined)?.[name];

  if (value === undefined) {
    throw new Error(`the ${table} table in mermaid's db has no ${name}`);
  }

  return value as T;
};

// The name an enum table gives a value, the inverse of enumValue.
const enumName = (db: AnyDb, table: string, value: unknown): string => {
  const entry = Object.entries((db[table] as Readonly<Record<string, unknown>> | undefined) ?? {}).find(
    ([, v]) => v === value,
  );

  if (!entry) {
    throw new Error(`the ${table} table in mermaid's db has no value ${String(value)}`);
  }

  return entry[0];
};

// How each end of a relationship is drawn, by erDb's Cardinality name, beside
// the source entity and beside the target entity.
const ER_NEAR_SOURCE: Readonly<Record<string, string>> = {
  ONLY_ONE: "||",
  ZERO_OR_ONE: "|o",
  ONE_OR_MORE: "}|",
  ZERO_OR_MORE: "}o",
  MD_PARENT: "u",
};
const ER_NEAR_TARGET: Readonly<Record<string, string>> = {
  ONLY_ONE: "||",
  ZERO_OR_ONE: "o|",
  ONE_OR_MORE: "|{",
  ZERO_OR_MORE: "o{",
  MD_PARENT: "u",
};

// The connector of a relationship, as the source spells it, and its two ends
// by name. The parser stores the marker beside entityA as cardB, and the one
// beside entityB as cardA, so `A ||--o{ B` gives cardB ONLY_ONE and cardA
// ZERO_OR_MORE: the source end is cardB and the target end cardA.
const erConnector = (
  db: AnyDb,
  r: ErRelationship,
): Pick<GraphEdge, "kind" | "cardinality" | "ends" | "identifying"> => {
  const { cardA, cardB, relType } = r.relSpec ?? {};
  const ends = {
    from: enumName(db, "Cardinality", cardB),
    to: enumName(db, "Cardinality", cardA),
  };
  const identifying = relType === enumValue(db, "Identification", "IDENTIFYING");

  if (!identifying && relType !== enumValue(db, "Identification", "NON_IDENTIFYING")) {
    throw new Error(`no line for the relationship type ${relType}`);
  }

  const line = identifying ? "--" : "..";
  const [nearSource, nearTarget] = [ER_NEAR_SOURCE[ends.from], ER_NEAR_TARGET[ends.to]];

  if (!(nearSource && nearTarget)) {
    throw new Error(`no cardinality for the relationship ${ends.from} ${ends.to}`);
  }

  return {
    kind: line,
    cardinality: `${nearSource}${line}${nearTarget}`,
    ends,
    identifying,
  };
};

// An entity is a node and a relationship an edge. The db keys entities by
// name, and a relationship names its two ends by the entity's own id.
const erGraph = (type: string, db: AnyDb): DiagramGraph => {
  const er = db as unknown as ErDB;
  const entities = er.getEntities();
  const rels = er.getRelationships();
  const nameOf = new Map([...entities].map(([name, e]) => [e.id ?? name, name]));
  const id = edgeIds();

  return {
    diagram_type: type,
    nodes: [...entities].map(([name, e]) => ({
      id: name,
      label: e.alias || name,
      parent: null,
      ...rowsOf((e.attributes ?? []).map(erRow)),
    })),
    edges: rels.map((r) => {
      const source = nameOf.get(r.entityA ?? "") ?? r.entityA ?? "";
      const target = nameOf.get(r.entityB ?? "") ?? r.entityB ?? "";

      return {
        id: id(source, target),
        source,
        target,
        ...erConnector(db, r),
        ...(r.roleA ? { label: r.roleA } : {}),
      };
    }),
    subgraphs: [],
  };
};

// A member as the source writes it, from classDb's fields: visibility, name,
// then for a method its parameters, classifier and return type.
const classRow = (m: ClassMember, method: boolean): string => {
  const head = `${m.visibility ?? ""}${m.id ?? ""}`;

  if (!method) {
    return `${head}${m.classifier ?? ""}`;
  }

  return `${head}(${m.parameters ?? ""})${m.classifier ?? ""}${m.returnType ? ` ${m.returnType}` : ""}`;
};

// A relation end's marker, by the name classDb's relationType table gives its
// number, beside the first class and beside the second. An end with no marker
// is "none".
const CLASS_NEAR_1: Readonly<Record<string, string>> = {
  AGGREGATION: "o",
  EXTENSION: "<|",
  COMPOSITION: "*",
  DEPENDENCY: "<",
  LOLLIPOP: "()",
};
const CLASS_NEAR_2: Readonly<Record<string, string>> = {
  AGGREGATION: "o",
  EXTENSION: "|>",
  COMPOSITION: "*",
  DEPENDENCY: ">",
  LOLLIPOP: "()",
};

const classEnd = (db: AnyDb, markers: Readonly<Record<string, string>>, type: number | string | undefined): string => {
  if (type === undefined || type === "none") {
    return "";
  }

  const marker = markers[enumName(db, "relationType", type)];

  if (marker === undefined) {
    throw new Error(`no marker for the class relation end ${type}`);
  }

  return marker;
};

// Every row a class draws: its members, then its methods.
const classRows = (c: ClassNode): string[] => [
  ...(c.members ?? []).map((m) => classRow(m, false)),
  ...(c.methods ?? []).map((m) => classRow(m, true)),
];

// A multiplicity is quoted beside its end, as the source writes it.
const classEdge = (db: AnyDb, r: ClassRelation, id: (source: string, target: string) => string): GraphEdge => {
  const [source, target] = [r.id1 ?? "", r.id2 ?? ""];
  const dotted = r.relation?.lineType === enumValue(db, "lineType", "DOTTED_LINE");
  const line = dotted ? ".." : "--";
  const [end1, end2] = [classEnd(db, CLASS_NEAR_1, r.relation?.type1), classEnd(db, CLASS_NEAR_2, r.relation?.type2)];
  const kind = `${end1}${line}${end2}`;
  const quoted = (t: string | undefined): string[] => (t && t !== "none" ? [`"${t}"`] : []);
  const [near1, near2] = [quoted(r.relationTitle1), quoted(r.relationTitle2)];
  const cardinality = near1.length + near2.length > 0 ? [...near1, kind, ...near2].join(" ") : "";

  return {
    id: id(source, target),
    source,
    target,
    kind,
    ...(cardinality ? { cardinality } : {}),
    ...(r.title ? { label: r.title } : {}),
  };
};

// A class is a node, a namespace a subgraph, and a relation an edge. A
// lollipop interface is drawn, not counted, so it is a pseudo node that its
// relation names as one end.
const classGraph = (type: string, db: AnyDb): DiagramGraph => {
  const classesDb = db as unknown as ClassDB;
  const classes = classesDb.getClasses();
  const namespaces = classesDb.getNamespaces();
  const relations = classesDb.getRelations();
  const interfaces = (Array.isArray(db.interfaces) ? db.interfaces : []) as Array<{ id?: string; label?: string }>;
  const id = edgeIds();

  return {
    diagram_type: type,
    nodes: [...classes].map(([key, c]) => ({
      id: key,
      label: c.label || key,
      parent: c.parent ?? null,
      ...(c.shape ? { shape: c.shape } : {}),
      ...rowsOf(classRows(c)),
    })),
    edges: relations.map((r) => classEdge(db, r, id)),
    subgraphs: [...namespaces].map(([key, ns]) => ({
      id: key,
      label: ns.label || key,
      parent: ns.parent ?? null,
    })),
    pseudo: {
      nodes: interfaces.map((i) => ({
        id: i.id ?? "",
        label: i.label ?? "",
        parent: null,
        shape: "lollipop",
      })),
      edges: [],
    },
  };
};

const READERS: Record<string, (type: string, db: AnyDb) => DiagramGraph> = {
  "flowchart-v2": flowchartGraph,
  flowchart: flowchartGraph,

  // A flowchart drawn with the ELK layout, parsed into the same db.
  "flowchart-elk": flowchartGraph,
  graph: flowchartGraph,
  classDiagram: classGraph,
  "classDiagram-v2": classGraph,
  class: classGraph,
  mindmap: mindmapGraph,
  sequence: sequenceGraph,
  er: erGraph,
  stateDiagram: stateGraph,
  "stateDiagram-v2": stateGraph,
};

export const extractGraph = memoBySource(async (content: string): Promise<DiagramGraph> => {
  const mermaid = await getMermaidCore();

  await mermaid.parse(content);

  const diagram = await mermaid.mermaidAPI.getDiagramFromText(content);
  const type = diagram.type;
  const read = READERS[type];

  if (!read) {
    throw new Error(`extractGraph reads ${Object.keys(READERS).join(", ")}, not ${type}`);
  }

  return read(type, diagram.db as unknown as AnyDb);
});
