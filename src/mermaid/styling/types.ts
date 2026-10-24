import type { Diagram } from "mermaid/dist/Diagram.js";

// One styled thing in the parser's result: a classDef, a node, entity, state
// or class that a style statement styles, or an edge that a linkStyle styles.
// Properties reflect the renderer cascade, including inherited defaults.

export interface StyleDirective {
  kind: "classDef" | "style" | "linkStyle";
  selector: string;
  properties: Record<string, string>;
  line: number; // 1-based, within the diagram text
}

export type Db = Record<string, unknown>;
export type Method = (...args: unknown[]) => unknown;

// The slice of a JISON lexer the trace reads: the text it has consumed so
// far, its current match, and the token text the grammar's action kept.
export interface Lexer {
  lex: Method;
  matched: string;
  match: string;
  yytext: string;
}

export interface Jison {
  lexer?: Lexer;
  terminals_?: Record<number, string>;
  yy?: unknown;
}

// The diagram mermaid's getDiagramFromText returns: the preprocessed text it
// parsed, its DB and its parser.
export type ParsedDiagram = Pick<Diagram, "type" | "text"> & {
  db: Db;
  parser: Jison & { parser?: Jison; parse: Diagram["parser"]["parse"] };
};

// A token as the diagram's lexer read it, with its 1-based line and 0-based
// columns in the text mermaid parsed.
export interface Token {
  name: string;
  text: string;
  line: number;
  column: number;
  endColumn: number;
}

export type DirectiveKind = StyleDirective["kind"];

// One style statement as the parser read it: what it styles, the
// declarations it wrote, and the index of its keyword token in the tokens the
// lexer read, or -1 when no token is its keyword.
export interface Statement {
  kind: DirectiveKind;
  ids: string[];
  styles: string[];
  keyword: number;
}

// What a DB call says about its statement. lexed, when set, is the text of
// the tokens after the keyword as the grammar passed them to the DB, which
// pairs a call the DB makes after the parse with its keyword token.
export type Read = Omit<Statement, "keyword"> & { lexed?: string[] };

// A DB method a style statement calls, and what the statement was, read off
// the call's arguments or the DB after the call. apply runs the DB's own
// method, once; the wrapper runs it after the hook when the hook does not.
export type Hook = (args: unknown[], db: Db, apply: () => void) => Read | null;
export type Hooks = Readonly<Record<string, Hook>>;

// What a traced parse yields: the tokens, the style statements, and the text
// the lexer read, which their lines count in.
export interface Traced {
  tokens: Token[];
  statements: Statement[];
  input: string;
}

// One styled thing in the DB: the declarations it inherits from its classes or
// the default linkStyle, then its own.
export interface Styled {
  kind: DirectiveKind;
  selector: string;
  inherited: string[];
  own: string[];
}

// How one diagram family's style statements reach its DB, where its values
// sit, and how its styled things are read back.
export interface Reader {
  hooks: Hooks;
  styled: (db: Db, statements: Statement[]) => Styled[];
}

// A diagram as the parser read it: its DB, the tokens its lexer read, the
// style statements it made, the text the lexer read, and how a line of that
// text maps to the source.
export interface ParsedStyles {
  type: string;
  db: Db;
  tokens: Token[];
  statements: Statement[];
  input: string;
  sourceLine: (line: number, keywordEnd?: number) => number | null;
}
