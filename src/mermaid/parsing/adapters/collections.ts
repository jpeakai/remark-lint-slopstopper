import type { CynefinDB } from "mermaid/dist/diagrams/cynefin/types.js";
import { type AnyDb, callGetter, type Structure } from "../model.ts";

interface C4Boundary {
  alias?: string;
  label?: { text?: string };
}
export function adaptC4(db: AnyDb): Structure {
  const shapes =
    callGetter<Array<{ alias?: string }>>(db, "getC4ShapeArray") ?? [];
  const rels = callGetter<Array<unknown>>(db, "getRels") ?? [];
  const boundaries = callGetter<C4Boundary[]>(db, "getBoundaries") ?? [];
  // Top-level "global" boundary is synthetic; exclude from user-visible count.
  const userBoundaries = boundaries.filter(
    (b) => b.alias && b.alias !== "global",
  );
  return {
    nodeIds: shapes.map((s) => s.alias ?? ""),
    edges: rels.length,
    subgraphNames: userBoundaries.map((b) => b.alias ?? ""),
    maxDepth: userBoundaries.length > 0 ? 1 : 0,
  };
}

interface GanttTask {
  id?: string;
  task?: string;
}
interface GanttSection {
  name?: string;
}
export function adaptGantt(db: AnyDb): Structure {
  const tasks = callGetter<GanttTask[]>(db, "getTasks") ?? [];
  const sections = callGetter<GanttSection[]>(db, "getSections") ?? [];
  return {
    nodeIds: tasks.map((t) => t.id ?? t.task ?? ""),
    edges: 0,
    subgraphNames: sections.map((s) => s.name ?? ""),
    maxDepth: sections.length > 0 ? 1 : 0,
  };
}

interface KanbanNode {
  id?: string;
  parentId?: string;
  isGroup?: boolean;
}
export function adaptKanban(db: AnyDb): Structure {
  // getData() returns a flat node list; isGroup=true marks columns, tasks
  // point at their column via parentId.
  const data = callGetter<{ nodes?: KanbanNode[] } | null>(db, "getData");
  const nodes = data?.nodes ?? [];
  const columns = nodes.filter((n) => n.isGroup === true);
  const tasks = nodes.filter((n) => n.isGroup === false);
  return {
    nodeIds: tasks.map((t) => t.id ?? ""),
    edges: 0,
    subgraphNames: columns.map((c) => c.id ?? ""),
    maxDepth: columns.length > 0 ? 1 : 0,
  };
}

type QuadrantText = { text?: string } | string | undefined;
interface QuadrantData {
  quadrants?: Array<{ text?: QuadrantText }>;
  points?: Array<{ text?: QuadrantText }>;
}
// A node is every plotted point, plus every quadrant that carries a label. The
// four quadrant boxes are always drawn, so an unlabelled one adds nothing to
// read, while every point is a mark the reader must place.
export function adaptQuadrantChart(db: AnyDb): Structure {
  const data = callGetter<QuadrantData | null>(db, "getQuadrantData");
  const textOf = (t: QuadrantText): string =>
    typeof t === "string" ? t : (t?.text ?? "");
  const quadrants = (data?.quadrants ?? [])
    .map((q) => textOf(q.text))
    .filter((t) => t.trim() !== "");
  const points = (data?.points ?? []).map(
    (p, i) => textOf(p.text) || `point_${i}`,
  );
  return {
    nodeIds: [...quadrants, ...points],
    edges: 0,
    subgraphNames: [],
    maxDepth: 0,
  };
}

export function adaptRequirement(db: AnyDb): Structure {
  // requirements and elements are both Maps keyed on name. relations is an Array.
  const requirements =
    db.requirements instanceof Map
      ? db.requirements
      : new Map<string, unknown>();
  const elements =
    db.elements instanceof Map ? db.elements : new Map<string, unknown>();
  const relations = (
    Array.isArray(db.relations) ? db.relations : []
  ) as Array<unknown>;
  return {
    nodeIds: [...requirements.keys(), ...elements.keys()],
    edges: relations.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

export function adaptSankey(db: AnyDb): Structure {
  const nodes = callGetter<Array<{ id?: string }>>(db, "getNodes") ?? [];
  const links = callGetter<Array<unknown>>(db, "getLinks") ?? [];
  return {
    nodeIds: nodes.map((n) => n.id ?? ""),
    edges: links.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

interface TimelineTask {
  task?: string;
  section?: string;
  events?: string[];
}
interface TimelineSection {
  sectionName?: string;
  section?: string;
}
export function adaptTimeline(db: AnyDb): Structure {
  // Every period and every event under it is a box on the page.
  const tasks = callGetter<TimelineTask[]>(db, "getTasks") ?? [];
  const sections = callGetter<TimelineSection[]>(db, "getSections") ?? [];
  return {
    nodeIds: tasks.flatMap((t) => [
      t.task ?? "",
      ...(t.events ?? []).map((e) => `${t.task ?? ""}: ${e}`),
    ]),
    edges: 0,
    subgraphNames: sections.map((s) => s.sectionName ?? s.section ?? ""),
    maxDepth: sections.length > 0 ? 1 : 0,
  };
}

interface JourneyTask {
  task?: string;
}
interface JourneySection {
  id?: string;
  name?: string;
}
export function adaptJourney(db: AnyDb): Structure {
  const tasks = callGetter<JourneyTask[]>(db, "getTasks") ?? [];
  const sections = callGetter<JourneySection[]>(db, "getSections") ?? [];
  return {
    nodeIds: tasks.map((t) => t.task ?? ""),
    edges: 0,
    subgraphNames: sections.map((s) => s.name ?? s.id ?? ""),
    maxDepth: sections.length > 0 ? 1 : 0,
  };
}

interface VennSet {
  id?: string;
}
interface VennSubset {
  sets?: string[];
}
export function adaptVenn(db: AnyDb): Structure {
  const sets = callGetter<VennSet[]>(db, "getCurrentSets") ?? [];
  const subsets = callGetter<VennSubset[]>(db, "getSubsetData") ?? [];
  // Subsets with multiple sets = unions/intersections = edges.
  const multiSetSubsets = subsets.filter((s) => (s.sets?.length ?? 0) >= 2);
  return {
    nodeIds: sets.map((s) => s.id ?? ""),
    edges: multiSetSubsets.length,
    subgraphNames: [],
    maxDepth: 0,
  };
}

interface XYChartData {
  xAxis?: { categories?: string[] };
  plots?: Array<{ data?: unknown[] }>;
}
// A node is an x position: a category, or, on a numeric x-axis, a point of the
// longest series.
export function adaptXychart(db: AnyDb): Structure {
  const data = callGetter<XYChartData | null>(db, "getXYChartData");
  const categories = data?.xAxis?.categories ?? [];
  if (categories.length > 0)
    return { nodeIds: categories, edges: 0, subgraphNames: [], maxDepth: 0 };
  const longest = Math.max(
    0,
    ...(data?.plots ?? []).map((p) => p.data?.length ?? 0),
  );
  return {
    nodeIds: Array.from({ length: longest }, (_, i) => `x_${i}`),
    edges: 0,
    subgraphNames: [],
    maxDepth: 0,
  };
}

// The renderer always draws all five labelled domain regions. It clips the
// confusion domain to three badges and one overflow badge, and skips loops.
export function adaptCynefin(rawDb: AnyDb): Structure {
  const db = rawDb as unknown as CynefinDB;
  const domains = db.getDomains();
  const subgraphNames = [
    "complex",
    "complicated",
    "clear",
    "chaotic",
    "confusion",
  ];
  const nodeIds: string[] = [];
  for (const name of subgraphNames) {
    const items =
      domains.get(name as Parameters<typeof domains.get>[0])?.items ?? [];
    const visibleCount =
      name === "confusion" ? Math.min(items.length, 3) : items.length;
    for (let i = 0; i < visibleCount; i++) nodeIds.push(`${name}/${i}`);
    if (visibleCount < items.length) nodeIds.push(`${name}/overflow`);
  }
  const edges = db
    .getTransitions()
    .filter((transition) => transition.from !== transition.to).length;
  return { nodeIds, edges, subgraphNames, maxDepth: 1 };
}
