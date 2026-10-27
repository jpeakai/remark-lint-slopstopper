import { isLangiumType, type LangiumType, readLangiumStructure } from "./adapters/grammar.ts";
import { readCoreStructure } from "./adapters/index.ts";
import { detectType, getMermaidCore, memoBySource } from "./engine.ts";
import { type ParserError, parserError } from "./errors.ts";
import type { Structure } from "./model.ts";

// Parser-family selection and projection into the package's complexity model.

export interface DiagramStats {
  nodes: number;
  edges: number;
  subgraphs: number;

  // How deep real containers nest: flowchart subgraphs, composite states,
  // architecture groups and the like.
  max_subgraph_depth: number;

  // How far a tree-shaped diagram (mindmap, treemap, treeView, ishikawa)
  // reaches below its root. Those types draw no subgraphs, so their depth is
  // kept apart from max_subgraph_depth and the nesting rule never reads it.
  // It is 0 for every other type.
  max_tree_depth: number;

  // The rows drawn inside a node: an erDiagram entity's attributes, and a
  // classDiagram class's attributes and methods. A row is text to read, but it
  // sits in a box the reader has already found, so it is not a node. It is 0
  // for every other type.
  rows: number;
  node_ids: string[];
  subgraph_names: string[];

  // The parser that read the diagram, or, on a failure, the one whose reason
  // `error` carries: langium for the types its grammars own, else mermaid-core.
  parser_used: "langium" | "mermaid-core";
  diagram_type: string;

  // The parser's reason, on one line, when no parser produced structure. Line
  // numbers in it count from the diagram's own first line.
  error: string | null;

  // The diagram line the parser's error points at, counted from the diagram's
  // own first line, or null when it points at none or there is no error. It
  // is optional, so a DiagramStats built without it stays valid.
  error_line?: number | null;
}

// The keyword a diagram type is declared with, where mermaid's id for the type
// differs from it. Every other id, such as pie or gantt, is its own keyword. A
// type declared two ways has one keyword: `graph` and `flowchart` are both
// flowchart, and the v2 class and state diagrams are classDiagram and
// stateDiagram.
const KEYWORD_OF_TYPE: Readonly<Record<string, string>> = {
  flowchart: "flowchart",
  "flowchart-v2": "flowchart",
  er: "erDiagram",
  sequence: "sequenceDiagram",
  class: "classDiagram",
  classDiagram: "classDiagram",
  state: "stateDiagram",
  stateDiagram: "stateDiagram",
  requirement: "requirementDiagram",
};

const keywordOf = (type: string | null): string | null => (type === null ? null : (KEYWORD_OF_TYPE[type] ?? type));

// The diagram_type of a diagram whose type mermaid does not detect.
export const UNKNOWN_TYPE = "unknown";

export const extractStats = memoBySource((content) => readStats(content));

async function readStats(content: string): Promise<DiagramStats> {
  const type = detectType(content);
  const keyword = keywordOf(type) ?? UNKNOWN_TYPE;

  // 1. Langium grammar (@mermaid-js/parser) — typed AST, no DOM needed.
  // Its error is kept, because for these types it is the parser that owns the
  // grammar, and mermaid core's attempt below is only a second chance.
  const langium = type !== null && isLangiumType(type);
  let langiumError: ParserError | null = null;

  if (langium) {
    try {
      // Mermaid's official preprocessing removes YAML/directives before its
      // Langium grammar runs. Feed that same text to the standalone parser.
      const mermaid = await getMermaidCore();
      const diagram = await mermaid.mermaidAPI.getDiagramFromText(content);

      return await extractLangiumStats(diagram.text, type, diagram.db);
    } catch (err) {
      langiumError = parserError(err);
    }
  }

  // 2. Mermaid-core JISON parser via happy-dom. The shim satisfies
  // DOMPurify; the parsers populate each type's DB (vertices, edges,
  // blocks, sections, etc.). A per-type adapter in extractCoreStats reads
  // the canonical DB shape.
  let coreError: ParserError;

  try {
    return await extractCoreStats(content);
  } catch (err) {
    coreError = parserError(err);
  }

  const failure = langiumError ?? coreError;

  // 3. Neither canonical parser produced stats. Return a tagged failure so
  // parseFailed (metrics.ts) flags it, reported as parse-diagram-unparseable.
  return {
    nodes: 0,
    edges: 0,
    subgraphs: 0,
    max_subgraph_depth: 0,
    max_tree_depth: 0,
    rows: 0,
    node_ids: [],
    subgraph_names: [],
    parser_used: langium ? "langium" : "mermaid-core",
    diagram_type: keyword,
    error: failure.reason,
    error_line: failure.line,
  };
}

function projectStats(structure: Structure, type: string, parser: DiagramStats["parser_used"]): DiagramStats {
  return {
    nodes: structure.nodeIds.length,
    edges: structure.edges,
    subgraphs: structure.subgraphNames.length,
    max_subgraph_depth: structure.maxDepth,
    max_tree_depth: structure.treeDepth ?? 0,
    rows: structure.rows ?? 0,
    node_ids: [...structure.nodeIds].sort(),
    subgraph_names: structure.subgraphNames,
    parser_used: parser,
    diagram_type: type,
    error: null,
    error_line: null,
  };
}

async function extractLangiumStats(content: string, type: LangiumType, db: unknown): Promise<DiagramStats> {
  const structure = await readLangiumStructure(type, content, db);

  return projectStats({ ...structure, nodeIds: [...new Set(structure.nodeIds.filter(Boolean))] }, type, "langium");
}

async function extractCoreStats(content: string): Promise<DiagramStats> {
  const mermaid = await getMermaidCore();

  // parse applies the frontmatter/directive configuration before DB inspection.
  await mermaid.parse(content);

  const diagram = await mermaid.mermaidAPI.getDiagramFromText(content);

  return projectStats(readCoreStructure(diagram.type, diagram.db), diagram.type, "mermaid-core");
}
