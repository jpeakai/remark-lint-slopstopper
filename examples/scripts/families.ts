import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TreeViewDB } from "mermaid/dist/diagrams/treeView/types.js";
import { parse } from "yaml";
import { createDocument } from "../../src/document/context.ts";
import { fences } from "../../src/mermaid/markdown.ts";
import { getMermaidCore } from "../../src/mermaid/parsing/engine.ts";
import { extractGraph } from "../../src/mermaid/parsing/graph.ts";
import { extractStats } from "../../src/mermaid/parsing/statistics.ts";

// A repair keeps each example's diagram family unless an explicit mapping
// permits a portable translation, and every approved translation must keep the
// original's labels, relationships, order and numbers.

// Detector names Mermaid uses for one family. Layout engines such as ELK stay
// distinct, so losing one is still a family change.
const ALIASES: Record<string, string> = {
  "flowchart-v2": "flowchart",
  graph: "flowchart",
  class: "classDiagram",
  "classDiagram-v2": "classDiagram",
  state: "stateDiagram",
  "stateDiagram-v2": "stateDiagram",
};

export const normalFamily = (type: string): string => ALIASES[type] ?? type;

export interface Translation {
  from: string;
  to: string;
  reason: string;
}

type FactCheck = (original: string, comparison: string) => Promise<string[]>;
type Graph = Awaited<ReturnType<typeof extractGraph>>;
type C4DB = typeof import("mermaid/dist/diagrams/c4/c4Db.js");

const core = async (source: string) => (await (await getMermaidCore()).mermaidAPI.getDiagramFromText(source)).db;

const plain = (label: string): string =>
  label
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();

const labelsOf = (graph: Graph) => new Map(graph.nodes.map((node) => [node.id, plain(node.label)]));

const mismatch = (what: string, expected: unknown, actual: unknown): string[] =>
  JSON.stringify(expected) === JSON.stringify(actual)
    ? []
    : [`${what} differ: expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`];

async function c4Facts(original: string, comparison: string): Promise<string[]> {
  const db = (await core(original)) as unknown as C4DB;
  const shapes = db.getC4ShapeArray() as {
    alias: string;
    label: { text: string };
    typeC4Shape: { text: string };
    descr?: { text: string };
  }[];
  const rels = db.getRels() as { from: string; to: string; label: { text: string } }[];
  const graph = await extractGraph(comparison);
  const problems: string[] = [];
  const kinds: Record<string, string> = { person: "Person", external_system: "External system" };

  for (const shape of shapes) {
    const label = plain(graph.nodes.find((node) => node.id === shape.alias)?.label ?? "");
    const expected = [shape.label.text, kinds[shape.typeC4Shape.text] ?? "System", shape.descr?.text ?? ""];

    if (!expected.every((part) => label.includes(part))) {
      problems.push(`${shape.alias} must show ${expected.filter(Boolean).join(", ")}; found ${JSON.stringify(label)}`);
    }
  }

  return [
    ...problems,
    ...mismatch(
      "Relationships",
      rels.map((rel) => [rel.from, rel.to, rel.label.text]),
      graph.edges.map((edge) => [edge.source, edge.target, edge.label ?? ""]),
    ),
  ];
}

interface SankeyDb {
  getGraph(): { nodes: { id: string }[]; links: { source: string; target: string; value: number }[] };
}

async function sankeyFacts(original: string, comparison: string): Promise<string[]> {
  const { nodes, links } = ((await core(original)) as unknown as SankeyDb).getGraph();
  const graph = await extractGraph(comparison);
  const labels = labelsOf(graph);

  return [
    ...mismatch("Flow nodes", nodes.map((node) => node.id).sort(), [...labels.values()].sort()),
    ...mismatch(
      "Flows and volumes",
      links.map((link) => [link.source, link.target, String(link.value)]),
      graph.edges.map((edge) => [labels.get(edge.source), labels.get(edge.target), edge.label ?? ""]),
    ),
  ];
}

interface TimelineDb {
  getSections(): string[];
  getTasks(): { section: string; task: string; events: string[] }[];
}

async function timelineFacts(original: string, comparison: string): Promise<string[]> {
  const db = (await core(original)) as unknown as TimelineDb;
  const graph = await extractGraph(comparison);
  const labels = labelsOf(graph);
  const sections = new Map(graph.subgraphs.map((subgraph) => [subgraph.id, plain(subgraph.label)]));
  const tasks = db
    .getTasks()
    .map((task) => ({ ...task, task: task.task.trim(), events: task.events.map((e) => e.trim()) }));
  const expected = tasks.flatMap((task, index) => {
    const next = tasks[index + 1];
    const chronology = next ? [[task.task, next.task]] : [];
    const chain = [task.task, ...task.events];

    return [...chronology, ...chain.slice(1).map((event, at) => [chain[at], event])];
  });
  const placed = tasks.map((task) => {
    const node = graph.nodes.find((item) => plain(item.label) === task.task);

    return [task.task, node?.parent ? sections.get(node.parent) : undefined];
  });

  return [
    ...mismatch(
      "Section membership",
      tasks.map((task) => [task.task, task.section]),
      placed,
    ),
    ...mismatch(
      "Chronology and event order",
      expected.map((edge) => JSON.stringify(edge)).sort(),
      graph.edges.map((edge) => JSON.stringify([labels.get(edge.source), labels.get(edge.target)])).sort(),
    ),
  ];
}

function treeEdges(node: ReturnType<TreeViewDB["getRoot"]>): string[] {
  return node.children.flatMap((child) => [JSON.stringify([node.name, child.name]), ...treeEdges(child)]);
}

async function treeFacts(original: string, comparison: string): Promise<string[]> {
  const db = (await core(original)) as unknown as TreeViewDB;
  const graph = await extractGraph(comparison);
  const labels = labelsOf(graph);

  return mismatch(
    "Hierarchy edges",
    treeEdges(db.getRoot()).sort(),
    graph.edges.map((edge) => JSON.stringify([labels.get(edge.source), labels.get(edge.target)])).sort(),
  );
}

// The translations a mapping may approve, each with the facts it must keep.
export const FACT_CHECKS: Readonly<Record<string, FactCheck>> = {
  "c4->flowchart": c4Facts,
  "sankey->flowchart": sankeyFacts,
  "timeline->flowchart": timelineFacts,
  "treeView->flowchart": treeFacts,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function loadTranslations(text: string): Readonly<Record<string, Translation>> {
  const data: unknown = parse(text);

  if (!isRecord(data)) {
    throw new Error("Translations must map example folders to a from, to and reason");
  }

  for (const [example, entry] of Object.entries(data)) {
    if (!isRecord(entry) || typeof entry.reason !== "string" || !entry.reason.trim()) {
      throw new Error(`${example} needs from, to and a reason`);
    }

    if (!FACT_CHECKS[`${String(entry.from)}->${String(entry.to)}`]) {
      throw new Error(`${example} maps ${String(entry.from)} to ${String(entry.to)}, which has no fact check`);
    }
  }

  return data as Record<string, Translation>;
}

async function diagrams(path: string): Promise<{ source: string; family: string }[]> {
  const markdown = await readFile(path, "utf8");

  return Promise.all(
    fences(createDocument(markdown)).map(async (fence) => ({
      source: fence.value,
      family: normalFamily((await extractStats(fence.value)).diagram_type),
    })),
  );
}

type Diagram = Awaited<ReturnType<typeof diagrams>>[number];

function familyProblems(path: string, original: Diagram, comparison: Diagram[], translation?: Translation): string[] {
  const permitted = new Set([original.family]);

  if (translation?.from === original.family) {
    permitted.add(translation.to);
  }

  return comparison
    .filter((diagram) => !permitted.has(diagram.family))
    .map(
      (diagram) =>
        `${path}: ${diagram.family} replaces the original ${original.family} without an approved translation`,
    );
}

async function factProblems(path: string, original: Diagram, comparison: Diagram[], translation: Translation) {
  const check = FACT_CHECKS[`${translation.from}->${translation.to}`] as FactCheck | undefined;
  const translated = comparison.filter((diagram) => diagram.family === translation.to);

  if (!(check && translated.length)) {
    return [];
  }

  if (translated.length > 1) {
    return [`${path}: a translation must be one ${translation.to} diagram`];
  }

  return (await check(original.source, translated[0]?.source ?? "")).map((problem) => `${path}: ${problem}`);
}

// Problems for one example, each naming its file.
export async function guardExample(root: string, example: string, translation?: Translation): Promise<string[]> {
  const originalPath = join("examples", example, "diagram.md");
  const comparisonPath = join("examples", example, "diagram-fixed.md");
  const [original] = await diagrams(join(root, originalPath));
  const comparison = await diagrams(join(root, comparisonPath));

  if (!original) {
    return [`${originalPath}: has no Mermaid diagram`];
  }

  if (!comparison.length) {
    return [`${comparisonPath}: has no Mermaid diagram`];
  }

  const problems = familyProblems(comparisonPath, original, comparison, translation);

  return problems.length || !translation ? problems : factProblems(comparisonPath, original, comparison, translation);
}

export async function guardExamples(root: string, examples: readonly string[]): Promise<string[]> {
  const translations = loadTranslations(await readFile(join(root, "examples", "translations.yml"), "utf8"));
  const problems: string[] = [];

  for (const example of examples) {
    problems.push(...(await guardExample(root, example, translations[example])));
  }

  return problems;
}
