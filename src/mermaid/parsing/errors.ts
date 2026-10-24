import { MermaidParseError } from "@mermaid-js/parser";

// What a JISON parser in mermaid core attaches to its error. A parse error
// carries the location and the tokens it expected; a lexical error carries only
// its 0-based line.
interface JisonHash {
  line?: number;
  token?: string | null;
  loc?: { first_line?: number };
  expected?: string[];
}

type LangiumResult = MermaidParseError["result"];

const jisonHash = (err: unknown): JisonHash | null => {
  const hash = (err as { hash?: unknown } | null)?.hash;
  return typeof hash === "object" && hash !== null ? (hash as JisonHash) : null;
};

// A reason on one line, and the diagram line it points at, when it points at one.
export interface ParserError {
  reason: string;
  line: number | null;
}

const fromJison = (hash: JisonHash): ParserError => {
  const parseLine = hash.loc?.first_line;
  if (parseLine !== undefined) {
    const got = `'${hash.token ?? ""}'`;
    const what = hash.expected?.length
      ? `Expecting ${hash.expected.join(", ")}, got ${got}`
      : `Unexpected ${got}`;
    return {
      reason: `Parse error on line ${parseLine}: ${what}`,
      line: parseLine,
    };
  }
  if (hash.line === undefined) return { reason: "Parse error", line: null };
  const line = hash.line + 1;
  return { reason: `Lexical error on line ${line}: Unrecognized text`, line };
};

// Where a Langium error points. A token past the end of the input, as an
// unexpected end is, has NaN for its line and column.
const at = (
  line: number | null | undefined,
  column: number | null | undefined,
): string =>
  Number.isFinite(line)
    ? `on line ${line}, column ${Number.isFinite(column) ? column : "?"}`
    : "at the end of the diagram";

const fromLangium = (result: LangiumResult): ParserError => {
  const lexer = result.lexerErrors.map((e) => ({
    line: e.line,
    text: `Lexer error ${at(e.line, e.column)}: ${e.message}`,
  }));
  const parser = result.parserErrors.map((e) => ({
    line: e.token?.startLine,
    text: `Parse error ${at(e.token?.startLine, e.token?.startColumn)}: ${e.message}`,
  }));
  const all = [...lexer, ...parser];
  const first = all.find((e) => Number.isFinite(e.line))?.line;
  return {
    reason: `Parsing failed: ${all.map((e) => e.text).join(" ")}`,
    line: first ?? null,
  };
};

// A parser's whole reason on one line, so a finding stays one line, built from
// the fields the parser attaches to its error: a JISON parser's hash, or a
// Langium grammar's lexer and parser errors. Any other error is mermaid's own,
// such as no diagram type detected, whose message runs on with the diagram's
// text, so its first line is the reason.
export const parserError = (err: unknown): ParserError => {
  const hash = jisonHash(err);
  if (hash) return fromJison(hash);
  if (err instanceof MermaidParseError) return fromLangium(err.result);
  const message = err instanceof Error ? err.message : String(err);
  return { reason: (message.split("\n")[0] ?? "").trim(), line: null };
};
