import type {
  Db,
  DirectiveKind,
  Hooks,
  Lexer,
  Method,
  ParsedDiagram,
  Statement,
  Token,
  Traced,
} from "./types.ts";

// Lexer instrumentation and reversible style callback tracing.

// The statement keywords, by the lexer's token name in lower case. Every JISON
// grammar that has style statements names its tokens after the keyword.
const KEYWORDS: Readonly<Record<string, DirectiveKind>> = {
  classdef: "classDef",
  style: "style",
  linkstyle: "linkStyle",
};

export const keywordOf = (
  token: Token | undefined,
): DirectiveKind | undefined => token && KEYWORDS[token.name.toLowerCase()];

// The keyword token of the statement a DB call is reducing. The parser has
// lexed the whole statement, and at most one lookahead token past it, which
// may be the next statement's keyword, so that last token is never the one.
const keywordAt = (tokens: Token[], kind: DirectiveKind): number =>
  tokens.findLastIndex(
    (t, i) => i < tokens.length - 1 && keywordOf(t) === kind,
  );

// The keyword token of a statement the DB applies after the whole parse, as a
// stateDiagram does: the first keyword of its kind not yet paired whose
// following tokens hold the text the grammar passed to the DB.
const pairedKeyword = (
  tokens: Token[],
  kind: DirectiveKind,
  lexed: string[],
  used: Set<number>,
): number =>
  tokens.findIndex(
    (t, k) =>
      !used.has(k) &&
      keywordOf(t) === kind &&
      lexed.every((text, n) => tokens[k + 1 + n]?.text.trim() === text),
  );

// Where the lexer's current match starts in the text it read, as a 1-based line
// and 0-based column. It is counted from the text the lexer has consumed, its
// `matched`, because JISON's own yylloc lines drift after a token that holds
// several newlines, such as a flowchart's run of blank lines.
const positionOf = (
  matched: string,
  match: string,
): { line: number; column: number } => {
  const start = matched.length - match.length;
  const before = matched.slice(0, start);
  let line = 1;
  for (const ch of before) if (ch === "\n") line++;
  return { line, column: start - (before.lastIndexOf("\n") + 1) };
};

// Replaces a method for the length of one parse and records how to put it back.
const wrapper =
  (restore: Array<() => void>, type: string) =>
  (
    target: object,
    name: string,
    around: (original: Method) => Method,
  ): void => {
    const slots = target as Record<string, unknown>;
    const own = Object.getOwnPropertyDescriptor(target, name);
    const original = slots[name];
    if (typeof original !== "function")
      throw new Error(`the ${type} parser has no ${name}`);
    slots[name] = around(original as Method);
    restore.push(() => {
      if (own) Object.defineProperty(target, name, own);
      else delete slots[name];
    });
  };

// Wraps each DB method a style statement calls, so every call records its
// statement and the keyword token it was lexed from.
const wrapHooks = (
  wrap: ReturnType<typeof wrapper>,
  db: Db,
  hooks: Hooks,
  { tokens, statements }: Omit<Traced, "input">,
): void => {
  const paired = new Set<number>();
  for (const [name, hook] of Object.entries(hooks)) {
    wrap(db, name, (original) => (...args: unknown[]) => {
      let result: unknown;
      let applied = false;
      const apply = (): void => {
        if (applied) return;
        applied = true;
        result = original.apply(db, args);
      };
      const read = hook(args, db, apply);
      apply();
      if (read) {
        const { lexed, ...statement } = read;
        const keyword = lexed
          ? pairedKeyword(tokens, read.kind, lexed, paired)
          : keywordAt(tokens, read.kind);
        paired.add(keyword);
        statements.push({ ...statement, keyword });
      }
      return result;
    });
  }
};

// Parses the diagram again with its lexer traced and its DB's style methods
// wrapped, then puts both back. It is one synchronous block, so no other parse
// can see the wrappers. A diagram mermaid reads with a Langium grammar has no
// JISON lexer and no style statements, so it yields no tokens.
const traceLexer = (
  wrap: ReturnType<typeof wrapper>,
  lexer: Lexer,
  terminals: Record<number, string>,
  tokens: Token[],
): void => {
  wrap(
    lexer,
    "lex",
    (lex) =>
      function (this: Lexer, ...args: unknown[]) {
        const code = lex.apply(this, args);
        const { line, column } = positionOf(this.matched, this.match);
        const name =
          typeof code === "number"
            ? (terminals[code] ?? String(code))
            : String(code);
        const last = tokens.at(-1);
        // The JISON lexer re-enters lex for a skipped match, so one token can be
        // returned twice.
        if (
          !(
            last &&
            last.name === name &&
            last.line === line &&
            last.column === column
          )
        ) {
          tokens.push({
            name,
            text: this.yytext,
            line,
            column,
            endColumn: column + this.match.length,
          });
        }
        return code;
      },
  );
};

export const traceParse = (diagram: ParsedDiagram, hooks: Hooks): Traced => {
  const jison = diagram.parser.parser ?? diagram.parser;
  const { lexer, terminals_: terminals } = jison;
  const tokens: Token[] = [];
  const statements: Statement[] = [];
  if (!(lexer && terminals)) return { tokens, statements, input: diagram.text };
  const { db } = diagram;
  const restore: Array<() => void> = [];
  const wrap = wrapper(restore, diagram.type);
  traceLexer(wrap, lexer, terminals, tokens);
  // A parser may rewrite the text before its lexer reads it, as the flowchart
  // parser folds the blank lines after a `}`, so the lexer's own input is the
  // text its positions count in.
  let input = diagram.text;
  wrap(
    lexer,
    "setInput",
    (setInput) =>
      function (this: Lexer, ...args: unknown[]) {
        input = String(args[0]);
        return setInput.apply(this, args);
      },
  );
  wrapHooks(wrap, db, hooks, { tokens, statements });
  try {
    (db.clear as Method | undefined)?.call(db);
    if (diagram.parser.parser) diagram.parser.parser.yy = db;
    diagram.parser.parse(diagram.text);
  } finally {
    for (const undo of restore.reverse()) undo();
  }
  return { tokens, statements, input };
};
