import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeProse } from "../prose/analyze.ts";
import { createDocument } from "./context.ts";
import { applyEdits, LostWordError, visibleWords } from "./edits.ts";

const paragraphOf = (source: string) => {
  const document = createDocument(source);
  const paragraph = document.paragraphs[0];
  assert.ok(paragraph);
  return { document, paragraph: paragraph.node };
};

test("a glyph swap that drops a word is a fixer defect, never a silent refusal", () => {
  const document = createDocument("Keep every word here.\n");
  assert.throws(
    () =>
      document.safeEdit(
        { start: 5, end: 11, text: "" },
        { kind: "same-shape" },
      ),
    LostWordError,
  );
  const renamed = createDocument("alpha beta gamma.\n");
  assert.throws(
    () =>
      renamed.safeEdit(
        { start: 6, end: 10, text: "BETA" },
        { kind: "same-shape" },
      ),
    /word 1 was "beta", now "BETA"/,
  );
});

test("a whitespace edit that changes structure is refused", () => {
  const document = createDocument("Para one\npara two.\n");
  assert.equal(document.safeEdit({ start: 8, end: 9, text: "\n\n" }), false);
  assert.equal(document.safeEdit({ start: 8, end: 9, text: " " }), true);
});

test("a glyph swap that creates emphasis keeps every word but is refused", () => {
  const source = "a · b*\n";
  const edit = { start: 1, end: 4, text: " *" };
  assert.deepEqual(
    visibleWords(createDocument(applyEdits(source, [edit])).tree),
    visibleWords(createDocument(source).tree),
  );
  assert.equal(
    createDocument(source).safeEdit(edit, { kind: "same-shape" }),
    false,
  );
  assert.equal(
    createDocument(source).safeEdit(
      { start: 1, end: 4, text: ", " },
      { kind: "same-shape" },
    ),
    true,
  );
});

test("a promotion must parse to exactly the declared list", () => {
  const source = "Items: a; b; c.\n";
  const { document, paragraph } = paragraphOf(source);
  const list = "Items:\n\n- a\n- b\n- c";
  const promotion = (fragment: string, listItems: number) =>
    document.safeEdit(
      { start: 0, end: source.length - 1, text: fragment },
      { kind: "replace-paragraph", paragraph, fragment, listItems },
    );
  assert.equal(promotion(list, 3), true);
  assert.equal(promotion(list, 2), false);
  assert.equal(promotion("Items:\n\n- a\n- b\n\n# c", 3), false);
  assert.equal(promotion("Items:\n\n- a\n- b\n\n> c", 2), false);
});

test("a promotion of a paragraph the source does not hold is refused", () => {
  const { paragraph } = paragraphOf("Elsewhere: x; y; z.\n\nMore text here.\n");
  const document = createDocument("Items: a; b; c.\n");
  const fragment = "Items:\n\n- a\n- b\n- c";
  assert.equal(
    document.safeEdit(
      { start: 0, end: 15, text: fragment },
      { kind: "replace-paragraph", paragraph, fragment, listItems: 3 },
    ),
    false,
  );
});

test("a promoted item keeps resolving a definition elsewhere in the document", () => {
  const source = "Items: [a][x]; b; c.\n\n[x]: https://example.com\n";
  const { document, paragraph } = paragraphOf(source);
  const fragment = "Items:\n\n- [a][x]\n- b\n- c";
  assert.equal(
    document.safeEdit(
      { start: 0, end: 20, text: fragment },
      { kind: "replace-paragraph", paragraph, fragment, listItems: 3 },
    ),
    true,
  );
});

test("visible words skip enumeration markers and joining conjunctions", () => {
  assert.deepEqual(
    visibleWords(createDocument("Do (a) this and (b) that.\n").tree),
    visibleWords(createDocument("1. Do\n2. this\n3. that\n").tree),
  );
  assert.deepEqual(
    visibleWords(createDocument("![alt](https://x.example/y) `code`\n").tree),
    ["https", "x", "example", "y", "alt", "code"],
  );
});

test("a batch that only fails together keeps its first verified edit", async () => {
  // Each run alone becomes a list; together the two lists would merge.
  const findings = await analyzeProse("a · b · c\n\nd · e · f\n", {
    rules: ["prose/list-interpunct-joined-run"],
  });
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((finding) => finding.fix?.text),
    ["- a\n- b\n- c", undefined],
  );
});
