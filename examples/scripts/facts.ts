import { extractGraph } from "../../src/mermaid/parsing/graph.ts";
import { type DiagramStats, extractStats } from "../../src/mermaid/parsing/statistics.ts";
import { IN } from "../../src/mermaid/splitting/labels/context.ts";

// The facts a same-family comparison must keep from its original: every label
// and relationship, the order of sequence messages, and every number. Portable
// Translations have their own fact checks in families.ts.

type Graph = Awaited<ReturnType<typeof extractGraph>>;

const plain = (label: string): string =>
  label
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

// The canonical graph, or null for a family without a graph projection.
async function graphOf(source: string): Promise<Graph | null> {
  try {
    return await extractGraph(source);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("extractGraph reads ")) {
      return null;
    }

    throw error;
  }
}

// A Split Plan detail names a node from another group as a boundary stub,
// "MEMBER (in GROUP)", which stands for that member.
const member = (label: string): string => {
  const at = label.indexOf(IN);

  return at > 0 && label.endsWith(")") ? label.slice(0, at) : label;
};

const edgeKeys = (graph: Graph): string[] => {
  const labels = new Map(graph.nodes.map((node) => [node.id, member(plain(node.label))]));

  return graph.edges.map((edge) =>
    JSON.stringify([labels.get(edge.source), labels.get(edge.target), plain(edge.label ?? "")]),
  );
};

// Items of `wanted` missing from `found`, counting repeats.
function missing(wanted: readonly string[], found: readonly string[]): string[] {
  const pool = new Map<string, number>();

  for (const item of found) {
    pool.set(item, (pool.get(item) ?? 0) + 1);
  }

  return wanted.filter((item) => {
    const left = pool.get(item) ?? 0;

    pool.set(item, left - 1);

    return left <= 0;
  });
}

// Whether `wanted` appears in `found` in the same order, gaps allowed.
function inOrder(wanted: readonly string[], found: readonly string[]): boolean {
  let at = 0;

  for (const item of found) {
    if (item === wanted[at]) {
      at += 1;
    }
  }

  return at === wanted.length;
}

async function graphFacts(original: Graph, comparisons: readonly string[], ordered: boolean): Promise<string[]> {
  const graphs = (await Promise.all(comparisons.map(graphOf))).filter((graph): graph is Graph => graph !== null);
  const labels = new Set(graphs.flatMap((graph) => graph.nodes.map((node) => plain(node.label))));
  const lostLabels = [...new Set(original.nodes.map((node) => plain(node.label)))].filter(
    (label) => !labels.has(label),
  );
  const wantedEdges = edgeKeys(original);
  const foundEdges = graphs.flatMap(edgeKeys);
  const lostEdges = missing(wantedEdges, foundEdges);
  const problems = [
    ...(lostLabels.length ? [`labels missing: ${lostLabels.join(", ")}`] : []),
    ...(lostEdges.length ? [`relationships missing: ${lostEdges.join(", ")}`] : []),
  ];

  if (ordered && !lostEdges.length && !inOrder(wantedEdges, foundEdges)) {
    problems.push("message order differs from the original");
  }

  return problems;
}

const STRUCTURE: (keyof DiagramStats)[] = [
  "nodes",
  "edges",
  "rows",
  "subgraphs",
  "max_subgraph_depth",
  "max_tree_depth",
];

async function structureFacts(original: string, comparisons: readonly string[]): Promise<string[]> {
  if (comparisons.length !== 1) {
    return [`a family without a graph projection must stay one diagram, found ${comparisons.length}`];
  }

  const [before, after] = await Promise.all([extractStats(original), extractStats(comparisons[0] ?? "")]);

  return STRUCTURE.filter((key) => before[key] !== after[key]).map(
    (key) => `${key} changed from ${String(before[key])} to ${String(after[key])}`,
  );
}

// Numbers in the diagram body, ignoring frontmatter, comments and styling.
export function numbersOf(source: string): string[] {
  const body = source.replace(/^---\n[\s\S]*?\n---\n/, "");

  return (
    body
      .split("\n")
      .filter((line) => !/^\s*(%%|style |classDef |linkStyle |class |cssClass )/.test(line))
      .join("\n")
      .replace(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi, "")
      .match(/(?<![\w.-])\d+(?:\.\d+)?(?![\w-])/g) ?? []
  );
}

export async function factProblems(original: string, comparisons: readonly string[]): Promise<string[]> {
  const graph = await graphOf(original);
  const type = (await extractStats(original)).diagram_type;
  const structural = graph
    ? await graphFacts(graph, comparisons, type === "sequence")
    : await structureFacts(original, comparisons);
  const lostNumbers = missing(numbersOf(original), comparisons.flatMap(numbersOf));

  return [...structural, ...(lostNumbers.length ? [`numbers missing: ${lostNumbers.join(", ")}`] : [])];
}
