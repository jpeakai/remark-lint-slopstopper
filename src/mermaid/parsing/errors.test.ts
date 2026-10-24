import assert from "node:assert/strict";
import { test } from "node:test";
import { getMermaidCore } from "./engine.ts";
import { parserError } from "./errors.ts";

// The error mermaid's own parse throws for a source.
const thrownBy = async (source: string): Promise<unknown> => {
  const mermaid = await getMermaidCore();
  try {
    await mermaid.parse(source);
  } catch (err) {
    return err;
  }
  throw new Error(`mermaid parsed ${JSON.stringify(source)} without error`);
};

test("a JISON parse error names the expected tokens and the token it got", async () => {
  assert.deepEqual(parserError(await thrownBy("gantt\n§")), {
    reason: "Parse error on line 2: Expecting 'taskData', got 'NL'",
    line: 2,
  });
});

test("a JISON lexical error reports its 0-based line as a 1-based line", async () => {
  assert.deepEqual(parserError(await thrownBy("requirementDiagram\n§")), {
    reason: "Lexical error on line 2: Unrecognized text",
    line: 2,
  });
});

test("a JISON parse error with no expected tokens reports the unexpected one", () => {
  const err = Object.assign(new Error("Parse error"), {
    hash: { token: "EOF", loc: { first_line: 4 }, expected: [] },
  });
  assert.deepEqual(parserError(err), {
    reason: "Parse error on line 4: Unexpected 'EOF'",
    line: 4,
  });
});

test("a JISON parse error with no token reports an empty token", () => {
  const err = Object.assign(new Error("Parse error"), {
    hash: { token: null, loc: { first_line: 2 } },
  });
  assert.equal(parserError(err).reason, "Parse error on line 2: Unexpected ''");
});

test("a JISON hash with no location and no line points at no line", () => {
  const err = Object.assign(new Error("Parse error"), { hash: {} });
  assert.deepEqual(parserError(err), { reason: "Parse error", line: null });
});

test("a Langium lexer error names its line and column", async () => {
  assert.deepEqual(parserError(await thrownBy("gitGraph\n  commit\n  &&&")), {
    reason:
      "Parsing failed: Lexer error on line 3, column 3: unexpected character: ->&<- at offset: 20, skipped 3 characters.",
    line: 3,
  });
});

test("a Langium parser error names the token it found", async () => {
  assert.deepEqual(parserError(await thrownBy('pie\n"a":')), {
    reason:
      "Parsing failed: Parse error on line 2, column 5: Expecting token of type 'NUMBER_PIE' but found `\n`.",
    line: 2,
  });
});

test("mermaid's own error keeps only its first line", async () => {
  assert.deepEqual(parserError(await thrownBy("not a diagram\nsecond line")), {
    reason:
      "No diagram type detected matching given configuration for text: not a diagram",
    line: null,
  });
});

test("a thrown value that is not an Error is read as its text", () => {
  assert.deepEqual(parserError("  plain failure \nmore"), {
    reason: "plain failure",
    line: null,
  });
});
