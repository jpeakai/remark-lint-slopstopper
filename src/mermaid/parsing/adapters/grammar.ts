import {
  type Architecture,
  type EventModel,
  type GitGraph,
  parse as langiumParse,
  type Packet,
  type Pie,
  type Radar,
  type Wardley,
} from "@mermaid-js/parser";
import type { TreeMapDB } from "mermaid/dist/diagrams/treemap/db.js";
import type { TreemapNode } from "mermaid/dist/diagrams/treemap/types.js";
import type { TreeViewDB } from "mermaid/dist/diagrams/treeView/types.js";
import { architectureDepth, type Structure, walkTree } from "../model.ts";

// Official Langium AST readers and the DB trees their renderers construct.

export type LangiumType = keyof typeof LANGIUM_READERS;
export const isLangiumType = (type: string): type is LangiumType =>
  Object.hasOwn(LANGIUM_READERS, type);

// ─── Per-type Langium AST adapters ──
// Each adapter reads ONLY the typed AST its grammar produces, the way the
// mermaid-core adapters below read only their type's DB.

const LANGIUM_READERS = {
  architecture: async (content) =>
    adaptLangiumArchitecture(await langiumParse("architecture", content)),
  info: async (content) =>
    adaptLangiumInfo(await langiumParse("info", content)),
  pie: async (content) => adaptLangiumPie(await langiumParse("pie", content)),
  gitGraph: async (content) =>
    adaptLangiumGitGraph(await langiumParse("gitGraph", content)),
  packet: async (content) =>
    adaptLangiumPacket(await langiumParse("packet", content)),
  radar: async (content) =>
    adaptLangiumRadar(await langiumParse("radar", content)),
  treemap: async (_content, db) =>
    adaptParsedTree((db as TreeMapDB).getRoot().children),
  treeView: async (_content, db) =>
    adaptParsedTree([(db as TreeViewDB).getRoot()]),
  wardley: async (content) =>
    adaptLangiumWardley(await langiumParse("wardley", content)),
  eventmodeling: async (content) =>
    adaptLangiumEventModeling(await langiumParse("eventmodeling", content)),
} satisfies Record<
  string,
  (content: string, db: unknown) => Promise<Structure>
>;

function adaptLangiumArchitecture(ast: Architecture): Structure {
  const { services, groups, edges: edgeArr } = ast;
  return {
    nodeIds: services.map((s) => s.id ?? ""),
    edges: edgeArr.length,
    subgraphNames: groups.map((g) => g.title ?? g.id ?? ""),
    maxDepth: architectureDepth(groups),
  };
}

// A trivial diagram type, with no structure.
function adaptLangiumInfo(_ast: unknown): Structure {
  return { nodeIds: [], edges: 0, subgraphNames: [], maxDepth: 0 };
}

function adaptLangiumPie(ast: Pie): Structure {
  const { sections } = ast;
  return {
    nodeIds: sections.map((s, i) => s.label ?? `slice_${i}`),
    edges: 0,
    subgraphNames: [],
    maxDepth: 0,
  };
}

function adaptLangiumPacket(ast: Packet): Structure {
  const { blocks } = ast;
  return {
    nodeIds: blocks.map((_, i) => `block_${i}`),
    edges: 0,
    subgraphNames: [],
    maxDepth: 0,
  };
}

function adaptLangiumGitGraph(ast: GitGraph): Structure {
  const { statements } = ast;
  const nodeIds: string[] = [];
  const subgraphNames: string[] = [];
  let edges = 0;
  for (const s of statements) {
    if (s.$type === "Commit") nodeIds.push(s.id ?? `commit_${nodeIds.length}`);
    else if (s.$type === "Branch")
      subgraphNames.push(s.name ?? `branch_${subgraphNames.length}`);
    else if (s.$type === "Merge") edges++;
  }
  return { nodeIds, edges, subgraphNames, maxDepth: 0 };
}

function adaptLangiumRadar(ast: Radar): Structure {
  const { axes, curves } = ast;
  return {
    nodeIds: [
      ...axes.map((a, i) => a.name ?? `axis_${i}`),
      ...curves.map((c, i) => c.name ?? `curve_${i}`),
    ],
    edges: axes.length * curves.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

// Read actual visible roots: treeView renders its generated slash root,
// whereas treemap does not render its unnamed wrapper.
function adaptParsedTree(roots: TreemapNode[]): Structure {
  const items = roots.flatMap((root) => [...walkTree(root)]);
  return {
    nodeIds: items.map(({ node }, index) => `${node.name}/${index}`),
    edges: items.filter(({ depth }) => depth > 0).length,
    subgraphNames: [],
    maxDepth: 0,
    treeDepth: items.reduce((depth, item) => Math.max(depth, item.depth), 0),
  };
}

function adaptLangiumWardley(ast: Wardley): Structure {
  // AST shape: ast.anchors[], ast.components[], ast.links[] — NOT ast.edges.
  const { components, anchors, links } = ast;
  return {
    nodeIds: [
      ...anchors.map((a, i) => a.name ?? `anchor_${i}`),
      ...components.map((c, i) => c.name ?? `comp_${i}`),
    ],
    edges: links.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

function adaptLangiumEventModeling(ast: EventModel): Structure {
  const lanes = new Map<number, string>();
  const frameLanes: number[] = [];
  const nodeIds: string[] = [];
  let edges = 0;
  ast.frames.forEach((frame, index) => {
    const { lane, label } = eventLane(frame, lanes);
    lanes.set(lane, label);
    frameLanes.push(lane);
    nodeIds.push(`${frame.name}/${index}`);
    edges += eventFrameEdges(frame, { ast, index, frameLanes, lane });
  });
  return {
    nodeIds,
    edges,
    subgraphNames: [...lanes.values()],
    maxDepth: lanes.size ? 1 : 0,
  };
}

type EventFrame = EventModel["frames"][number];
function eventCategory(frame: EventFrame): number {
  if (["ui", "pcr", "processor"].includes(frame.modelEntityType)) return 0;
  return ["cmd", "command", "rmo", "readmodel"].includes(frame.modelEntityType)
    ? 100
    : 200;
}
function eventLane(
  frame: EventFrame,
  lanes: Map<number, string>,
): { lane: number; label: string } {
  const category = eventCategory(frame);
  const parts = frame.entityIdentifier.split(".");
  const namespace = parts.length === 2 ? parts[0] : undefined;
  // Official renderer lane records omit namespace, so each qualified frame
  // gets a new category index instead of reusing an existing namespace lane.
  const occupied = [...lanes.keys()].filter(
    (key) => key > category && key < category + 100,
  );
  const lane = namespace ? Math.max(category, ...occupied) + 1 : category;
  const labels: Record<number, string> = {
    0: "UI/Automation",
    100: "Command/Read Model",
    200: "Events",
  };
  const categoryLabel = labels[category] ?? "Events";
  return {
    lane,
    label: namespace
      ? `${categoryLabel}: ${namespace} (${lane})`
      : categoryLabel,
  };
}
function eventFrameEdges(
  frame: EventFrame,
  context: {
    ast: EventModel;
    index: number;
    frameLanes: number[];
    lane: number;
  },
): number {
  if (frame.$type === "EmResetFrame") return 0;
  const { ast, index, frameLanes, lane } = context;
  if (!frame.sourceFrames.length)
    return frameLanes.slice(0, index).some((prior) => prior !== lane) ? 1 : 0;
  // Future references draw no edge and duplicate references draw one.
  const references = new Set(
    frame.sourceFrames.map((reference) => reference.$refText),
  );
  return ast.frames.filter(
    (source, sourceIndex) =>
      sourceIndex <= index && references.has(source.name),
  ).length;
}

export const readLangiumStructure = (
  type: LangiumType,
  content: string,
  db: unknown,
): Promise<Structure> => LANGIUM_READERS[type](content, db);
