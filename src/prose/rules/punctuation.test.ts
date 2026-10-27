import assert from "node:assert/strict";
import { test } from "node:test";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { createDocument } from "../../document/context.ts";
import { visibleWords } from "../../document/edits.ts";
import remarkSlopstopper, { type RemarkSlopstopperOptions } from "../../remark/plugin.ts";

type Rules = NonNullable<RemarkSlopstopperOptions["rules"]>;

const QUIET: Rules = {
  "contrast-text-below-aa": false,
  "complexity-visual-score-acceptable-exceeded": false,
};
const run = (source: string, fix: boolean, rules: Rules = {}) =>
  unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(remarkSlopstopper, { fix, rules: { ...QUIET, ...rules } })
    .process(source);
const lint = async (source: string, rules?: Rules) => (await run(source, false, rules)).messages.map((m) => m.ruleId);
const fixed = async (source: string, rules?: Rules) => String(await run(source, true, rules));
const words = (source: string) => visibleWords(createDocument(source).tree);

const refuses = async (source: string, reported?: string) => {
  assert.equal(await fixed(source), source);

  if (reported) {
    assert.ok((await lint(source)).includes(reported));
  }
};

const fixesTo = async (source: string, expected: string, gone?: string) => {
  const output = await fixed(source);

  assert.equal(output, expected);
  assert.equal(await fixed(output), output);
  assert.deepEqual(words(output), words(source));

  if (gone) {
    assert.ok(!(await lint(output)).includes(gone));
  }
};

const count = async (source: string, ruleId: string) => (await lint(source)).filter((id) => id === ruleId).length;

test("an em-dash and a stray interpunct in prose are reported, but not in code", async () => {
  assert.deepEqual((await lint("A tell — right here.\n\nAlso a · dot.\n\n```\ncode — with · glyphs\n```\n")).sort(), [
    "punctuation-em-dash-in-prose",
    "punctuation-interpunct-in-prose",
  ]);
});

test("a pair of em-dashes becomes parentheses and a lone one a colon", async () => {
  const rule = "punctuation-em-dash-in-prose";

  for (const [source, expected] of [
    ["The engine — not the fixer — decides what is kept.\n", "The engine (not the fixer) decides what is kept.\n"],
    ["One rule matters — never guess.\n", "One rule matters: never guess.\n"],
    ["The parser — and the lexer — work.\n", "The parser (and the lexer) work.\n"],
    ["The (parser — fast — ok) works.\n", "The (parser (fast) ok) works.\n"],
    ["Note: the parser — fast — works.\n", "Note: the parser (fast) works.\n"],
    ["The _parser — fast_ works.\n", "The _parser: fast_ works.\n"],
    ["One — two. Three — four.\n", "One: two.\nThree: four.\n"],
    ["word—word here.\n", "word: word here.\n"],
    ["One thing matters\t—\tspeed.\n", "One thing matters: speed.\n"],
    ["Title — sub\n===========\n\nBody.\n", "Title: sub\n===========\n\nBody.\n"],
    ["## Title — sub\n", "## Title: sub\n"],
    ["Text <span>a — b</span> end.\n", "Text <span>a: b</span> end.\n"],
    ["> The parser — which is fast — handles this.\n", "> The parser (which is fast) handles this.\n"],
    ["Text[^1] here.\n\n[^1]: A note — with a dash.\n", "Text[^1] here.\n\n[^1]: A note: with a dash.\n"],
    ["See [a — b](https://x.example/a—b) now.\n", "See [a: b](https://x.example/a—b) now.\n"],
  ] as const) {
    await fixesTo(source, expected, rule);
  }
});

test("each aside of an em-dash is its own finding", async () => {
  assert.equal(await count("One — two. Three — four.\n", "punctuation-em-dash-in-prose"), 2);
});

test("em-dashes whose rewrite is ambiguous stay reported", async () => {
  for (const source of [
    "Pages 10 — 12 cover it.\n",
    "From 2020—2021 only.\n",
    "From 2020 — 2021 only.\n",
    "A — b — c — d.\n",
    "Note: this — that.\n",
    "**Bold** — text.\n",
    "[link](u) — text.\n",
    "—\n",
    "An &mdash; entity &middot; here.\n",
    "Stars *a — b — c* end.\n",
  ]) {
    await refuses(source, "punctuation-em-dash-in-prose");
  }
});

test("a pair wholly inside emphasis is rewritten without losing a word", async () => {
  await fixesTo("Stars *a — be — c* end.\n", "Stars *a (be) c* end.\n");
});

test("unicode spaces around a dash belong to it", async () => {
  await fixesTo("One — two.\n", "One: two.\n");
  await fixesTo("One ​— two.\n", "One: two.\n");
});

test("a spaced stray interpunct becomes a comma in prose and headings", async () => {
  const rule = "punctuation-interpunct-in-prose";

  await fixesTo("Written in TypeScript · run on Bun.\n", "Written in TypeScript, run on Bun.\n", rule);
  await fixesTo("Home · About\n", "Home, About\n", rule);
  await fixesTo("# Docs · API · Blog\n", "# Docs, API, Blog\n", rule);
  await fixesTo("# Home · About\n\nSee docs · api.\n", "# Home, About\n\nSee docs, api.\n", rule);
  await fixesTo("Where x — y and a · b.\n", "Where x: y and a, b.\n");
});

test("glyph swaps inside table cells keep the table", async () => {
  await fixesTo("| a | b |\n| - | - |\n| x — y | p · q |\n", "| a | b |\n| - | - |\n| x: y | p, q |\n");
});

test("a tight or bare interpunct stays reported", async () => {
  for (const source of ["x·y is a product.\n", "·\n", "# A tight·glyph and a · spaced one\n"]) {
    await refuses(source, "punctuation-interpunct-in-prose");
  }
});

test("an escaped glyph never costs a word", async () => {
  assert.match(await fixed("Not a \\— dash · or \\· here.\n"), /\bor\b/);
});

test("code, HTML, frontmatter, alt text and autolinks are never rewritten", async () => {
  for (const source of [
    "Use `a — b` here.\n",
    "Run `a;b;c` then `d;e`.\n",
    "Call `(a)` then `(b)` and `(c)`.\n",
    "Para.\n\n    code — here · there; a; b\n",
    "Para.\n\n```\na — b · c; d; e (a) x (b) y\n```\n",
    "<div>\na — b · c · d\n</div>\n",
    "---\ntitle: a — b\ntags: x · y\n---\n\nBody.\n",
    "![a — b](x.png) text.\n",
    "Go <https://x.example/a·b> now.\n",
  ]) {
    await refuses(source);
  }
});

test("a single-line interpunct run is one list finding, not glyph findings", async () => {
  assert.deepEqual(await lint("[a](https://a) · [b](https://b) · [c](https://c) · plain d\n"), [
    "list-interpunct-joined-run",
  ]);

  const file = await run("one · two · three · four\n", false);

  assert.match(String(file.messages[0]?.reason), /4 items/);
  assert.deepEqual(await lint("A stray · here.\n"), ["punctuation-interpunct-in-prose"]);
});

test("an interpunct run becomes a bullet list after its label", async () => {
  const rule = "list-interpunct-joined-run";

  await fixesTo("Stack: Bun · TypeScript · biome.\n", "Stack:\n\n- Bun\n- TypeScript\n- biome\n", rule);
  await fixesTo("Docs · API · Blog\n", "- Docs\n- API\n- Blog\n", rule);
  await fixesTo("a·b·c\n", "- a\n- b\n- c\n", rule);
  await fixesTo("東京 · 大阪 · 京都\n", "- 東京\n- 大阪\n- 京都\n", rule);
  await fixesTo("Pick: this · or · that.\n", "Pick:\n\n- this\n- or\n- that\n", rule);
  await fixesTo(
    "- Stack: Bun · TypeScript · biome.\n- other\n",
    "- Stack:\n  - Bun\n  - TypeScript\n  - biome\n- other\n",
    rule,
  );
  await fixesTo(
    "Links: [a](https://a.example) · [b *c*](https://b.example) · `d`.\n",
    "Links:\n\n- [a](https://a.example)\n- [b *c*](https://b.example)\n- `d`\n",
    rule,
  );
  await fixesTo("Tools: `a · b` · c · d.\n", "Tools:\n\n- `a · b`\n- c\n- d\n", rule);
  await fixesTo(
    "Items: [a] · b · c.\n\n[a]: https://x.example 'T — t'\n",
    "Items:\n\n- [a]\n- b\n- c\n\n[a]: https://x.example 'T — t'\n",
    rule,
  );
});

test("an interpunct run the edit cannot trust stays reported", async () => {
  const rule = "list-interpunct-joined-run";

  await refuses("Stack: *Bun · TypeScript* · biome.\n", rule);
  await refuses("Links: [a · b](u) · c · d.\n", rule);
  await refuses("Built with Bun · TypeScript · biome\n", rule);
  await refuses("Stack: Bun · Node · and then a long sentence that clearly is not an item.\n", rule);
  await fixesTo(
    "- Item one — first.\n\n  Second para · x · y.\n- two\n",
    "- Item one: first.\n\n  Second para · x · y.\n- two\n",
  );
});

test("a threshold above the run hands its glyphs back to the stray-glyph policy", async () => {
  const raised = { "list-interpunct-joined-run": { minItems: 4 } };

  assert.deepEqual(await lint("Stack: Bun · Node · biome.\n", raised), ["punctuation-interpunct-in-prose"]);
  assert.deepEqual(await lint("Stack: Bun · Node.\n"), ["punctuation-interpunct-in-prose"]);

  const lowered = { "list-interpunct-joined-run": { minItems: 2 } };

  assert.deepEqual(await lint("Stack: Bun · Node.\n", lowered), ["list-interpunct-joined-run"]);

  const off = { "list-interpunct-joined-run": false };

  assert.deepEqual(await lint("Stack: Bun · Node · biome.\n", off), ["punctuation-interpunct-in-prose"]);
});

test("runs stacked on several lines ask for a nested list", async () => {
  const source =
    "Group A: [a](https://a) · [b](https://b) · [c](https://c).\nGroup B: [d](https://d) · [e](https://e) · [f](https://f).\n";

  const file = await run(source, false);
  const stacked = file.messages.filter((m) => m.ruleId !== "sentence-one-per-line");

  assert.deepEqual(
    stacked.map((m) => m.ruleId),
    ["list-stacked-interpunct-runs"],
  );
  assert.match(String(stacked[0]?.reason), /nested list/);
  assert.deepEqual(await lint("[a](https://a) · [b](https://b) · [c](https://c)\n"), ["list-interpunct-joined-run"]);
});

test("labelled stacked runs become one parent item per label", async () => {
  const rule = "list-stacked-interpunct-runs";

  await fixesTo(
    "Runtime: Bun · Node\nTooling: biome · tsc\n",
    "- Runtime\n  - Bun\n  - Node\n- Tooling\n  - biome\n  - tsc\n",
    rule,
  );
  await fixesTo(
    "Runtime: Bun · Node · Deno\nTools: biome · tsc · bun test\n",
    "- Runtime\n  - Bun\n  - Node\n  - Deno\n- Tools\n  - biome\n  - tsc\n  - bun test\n",
    rule,
  );
  await fixesTo(
    "Food: salt and pepper · bread\nDrink: tea · or coffee\n",
    "- Food\n  - salt and pepper\n  - bread\n- Drink\n  - tea\n  - coffee\n",
    rule,
  );
});

test("a stack with an unlabelled line is never merged into one list", async () => {
  const source = "Runtime: Bun · Node\nno label · here\n";

  assert.ok((await lint(source)).includes("list-stacked-interpunct-runs"));
  assert.ok(!(await fixed(source)).includes("Node no"));

  const off = { "list-stacked-interpunct-runs": false };

  assert.deepEqual((await lint("Runtime: Bun · Node\nTools: a · b\n", off)).sort(), [
    "punctuation-interpunct-in-prose",
    "sentence-one-per-line",
  ]);
});
