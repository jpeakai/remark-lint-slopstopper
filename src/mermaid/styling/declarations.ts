import { getMermaidCore } from "../parsing/engine.ts";
import { READERS } from "./adapters.ts";
import { keywordOf, traceParse } from "./lexer.ts";
import { propertiesOf } from "./properties.ts";
import { sourceLines } from "./source.ts";
import type { ParsedDiagram, ParsedStyles, Statement, StyleDirective, Styled } from "./types.ts";

// Parse effective declarations and attach conservative authored-source locations.

// The diagram parsed and traced, or null when mermaid cannot parse it. A
// diagram the parser cannot read has no colours to trust, and
// parse-diagram-unparseable reports it.
export const parseTraced = async (source: string): Promise<ParsedStyles | null> => {
  const mermaid = await getMermaidCore();
  let diagram: ParsedDiagram;

  try {
    // parse registers the diagram types before getDiagramFromText detects one.
    await mermaid.parse(source);
    diagram = (await mermaid.mermaidAPI.getDiagramFromText(source)) as unknown as ParsedDiagram;
  } catch {
    return null;
  }

  const reader = READERS[diagram.type];
  const { tokens, statements, input } = traceParse(diagram, reader?.hooks ?? {});

  return {
    type: diagram.type,
    db: diagram.db,
    tokens,
    statements,
    input,
    sourceLine: sourceLines(source, input),
  };
};

// A style statement in a diagram type whose styles the audit does not model.
export interface UnmodelledStyle {
  selector: string;
  line: number;
  reason: string;
}

export interface StyleReading {
  directives: StyleDirective[];
  unmodelled: UnmodelledStyle[];
}

// Source placement for effective styles.
interface Placing {
  statements: Statement[];
  place: (statement: Statement) => number | null;
  fallback: number;
}

// Preserve effective properties and the first mapped statement line.
const directiveOf = (thing: Styled, { statements, place, fallback }: Placing): StyleDirective => {
  const own = statements.filter((statement) => statement.kind === thing.kind && statement.ids.includes(thing.selector));
  const line = own.map(place).find((value) => value !== null);

  return {
    kind: thing.kind,
    selector: thing.selector,
    properties: propertiesOf([...thing.inherited, ...thing.own]),
    line: line ?? fallback,
  };
};

// The style statements of a diagram type with no reader, each a failure to
// audit rather than a silent pass.
const unmodelledOf = (parsed: ParsedStyles, keywordLine: number): UnmodelledStyle[] =>
  parsed.tokens.flatMap((t): UnmodelledStyle[] => {
    const kind = keywordOf(t);

    if (!kind) {
      return [];
    }

    return [
      {
        selector: kind,
        line: parsed.sourceLine(t.line, t.endColumn) ?? keywordLine,
        reason: `${kind} statements in a ${parsed.type} diagram are not modelled by the contrast audit`,
      },
    ];
  });

// Every style directive in a diagram, in source order, read from the parser.
export const readStyles = async (source: string): Promise<StyleReading> => {
  const parsed = await parseTraced(source);

  if (!parsed) {
    return { directives: [], unmodelled: [] };
  }

  const { type, db, tokens, statements, sourceLine } = parsed;
  const keywordLine = (tokens[0] && sourceLine(tokens[0].line)) ?? 1;
  const reader = READERS[type];

  if (!reader) {
    return { directives: [], unmodelled: unmodelledOf(parsed, keywordLine) };
  }

  const place = (s: Statement): number | null => {
    const keyword = tokens[s.keyword];

    return keyword ? sourceLine(keyword.line, keyword.endColumn) : null;
  };

  const directives = reader
    .styled(db, statements)
    .map((thing) =>
      directiveOf(thing, {
        statements,
        place,
        fallback: keywordLine,
      }),
    )
    .sort((a, b) => a.line - b.line);

  return { directives, unmodelled: [] };
};
