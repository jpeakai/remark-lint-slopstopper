import assert from "node:assert/strict";
import { test } from "node:test";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { createDocument } from "../../document/context.ts";
import { visibleWords } from "../../document/edits.ts";
import remarkSlopstopper, { type RemarkSlopstopperOptions } from "../../remark/plugin.ts";
import type { RuleOptions } from "../../types.ts";

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

test("semicolon runs of three or more items are reported, one joining semicolon is not", async () => {
  const rule = "list-semicolon-delimited-run";

  assert.equal(await count("We ship parsing; then linting; then fixing.\n", rule), 1);
  assert.equal(await count("The cache is warm; queries are fast.\n", rule), 0);
});

test("a semicolon run after a colon lead-in becomes a bullet list", async () => {
  const rule = "list-semicolon-delimited-run";

  await fixesTo(
    "A release needs: a signed tag; a changelog entry; and a green build.\n",
    "A release needs:\n\n- a signed tag\n- a changelog entry\n- a green build\n",
    rule,
  );
  await fixesTo("Needs: a; b; and c.\n", "Needs:\n\n- a\n- b\n- c\n", rule);
  await fixesTo("Needs: salt and pepper; bread; butter.\n", "Needs:\n\n- salt and pepper\n- bread\n- butter\n", rule);
  await fixesTo(
    "# Setup\n\nSetup needs three things: a token; a config file; and a running server.\n",
    "# Setup\n\nSetup needs three things:\n\n- a token\n- a config file\n- a running server\n",
    rule,
  );
});

test("semicolons inside emphasis, links and footnotes travel whole into their item", async () => {
  const rule = "list-semicolon-delimited-run";

  await fixesTo("Needs: *a; b*; c; d.\n", "Needs:\n\n- *a; b*\n- c\n- d\n", rule);
  await fixesTo("Needs: [a; b](u); c; d.\n", "Needs:\n\n- [a; b](u)\n- c\n- d\n", rule);
  await fixesTo("Needs: a[^1]; b; c.\n\n[^1]: n.\n", "Needs:\n\n- a[^1]\n- b\n- c\n\n[^1]: n.\n", rule);
});

test("a promotion keeps the sentences around the run in place", async () => {
  await fixesTo(
    "Read this first. You need: a token; a config; a server. Then run it.\n",
    "Read this first.\nYou need:\n\n- a token\n- a config\n- a server\n\nThen run it.\n",
  );
});

test("without a colon lead-in a semicolon run stays reported", async () => {
  const rule = "list-semicolon-delimited-run";

  await refuses("We need a token; a config; a server.\n", rule);
  await refuses("A release needs a signed tag; a changelog entry; a green build.\n", rule);
});

test("inline enumeration needs the first two markers of one family", async () => {
  const rule = "list-inline-enumeration-markers";

  for (const source of [
    "Two duties: (a) *name things* using canonical terms; (b) *keep it current* in the same change.\n",
    "Steps: (1) parse the file and (2) emit findings.\n",
  ]) {
    assert.equal(await count(source, rule), 1, source);
  }

  for (const source of ["See item (a) above.\n", "Run `f((a), (b))` here.\n"]) {
    assert.equal(await count(source, rule), 0, source);
  }
});

test("a clean marker sequence becomes a numbered list", async () => {
  const rule = "list-inline-enumeration-markers";

  await fixesTo(
    "The fix does (a) parse the file, (b) verify the tree, and (c) write it back.\n",
    "The fix does:\n\n1. parse the file\n2. verify the tree\n3. write it back\n",
    rule,
  );
  await fixesTo("Steps: (1) install (2) run (3) test.\n", "Steps:\n\n1. install\n2. run\n3. test\n", rule);
  await fixesTo("Do (i) this, (ii) that and (iii) more.\n", "Do:\n\n1. this\n2. that\n3. more\n", rule);
  await fixesTo("Do: (a) call f(x) (b) return.\n", "Do:\n\n1. call f(x)\n2. return\n", rule);
  await fixesTo("(a) first (b) second (c) third.\n", "1. first\n2. second\n3. third\n", rule);
  await fixesTo("Do (a) rock and roll, (b) salt and pepper.\n", "Do:\n\n1. rock and roll\n2. salt and pepper\n", rule);
});

test("references, gaps and mixed families are never promoted", async () => {
  for (const source of [
    "See (a) above for details.\n",
    "Do (a) this and (c) that.\n",
    "Do (a) this, (2) that.\n",
    "Steps (9) x (10) y.\n",
  ]) {
    await refuses(source);
  }

  const rule = "list-inline-enumeration-markers";

  await refuses("Do (a) call f(x) (b) return.\n", rule);
  await refuses("See (a) above and (b) below.\n", rule);
  await fixesTo("Do (a) this. Then (b) that.\n", "Do (a) this.\nThen (b) that.\n");
});

test("labelled comma runs need three labelled segments with content", async () => {
  const rule = "list-comma-labelled-run";

  for (const source of [
    "Rules: MD009 trailing spaces, MD010 hard tabs, MD012 blank lines, MD013 line length.\n",
    "Targets: `fmt` formats, `vet` inspects, `race` detects data races.\n",
  ]) {
    assert.equal(await count(source, rule), 1, source);
  }

  assert.deepEqual(await lint("We need eggs, milk, butter, and flour today.\n"), []);

  for (const source of [
    "Use MD001 for wraps, MD002 for budgets.\n",
    "The files `README.md`, `AGENTS.md`, and `CLAUDE.md` serve one role together.\n",
  ]) {
    assert.equal(await count(source, rule), 0, source);
  }
});

test("a labelled run becomes a bullet list that keeps each label", async () => {
  const rule = "list-comma-labelled-run";

  await fixesTo(
    "Targets: `fix` regenerates the bundle, `ci` asserts a clean tree, and `docs-ci` gates the prose.\n",
    "Targets:\n\n- `fix` regenerates the bundle\n- `ci` asserts a clean tree\n- `docs-ci` gates the prose\n",
    rule,
  );
  await fixesTo(
    "Rules: `A` salt and pepper, `B` counts, and `C` finds.\n",
    "Rules:\n\n- `A` salt and pepper\n- `B` counts\n- `C` finds\n",
    rule,
  );
  await fixesTo(
    "- Rules: `A` wraps, `B` counts, `C` finds.\n",
    "- Rules:\n  - `A` wraps\n  - `B` counts\n  - `C` finds\n",
    rule,
  );
});

test("comma-joined code spans are reported wherever they sit in a sentence", async () => {
  const rule = "list-comma-code-run";

  for (const source of [
    "- 4 services with no owner: `a`, `b`, `c`, `d`.\n",
    "The release touches `a`, `b`, `c` and `d`.\n",
    "Pick `a`, `b`, or `c`.\n",
    "A version containing `a`, `b` or `c` is a prerelease.\n",
  ]) {
    assert.equal(await count(source, rule), 1, source);
  }

  for (const source of [
    "Use `a` and `b`, or `c` alone.\n",
    "It reads `a`, `b` today.\n",
    "It parses, fixes and verifies the tree.\n",
    "It reads 1,024, 2,048 and 4,096 bytes.\n",
    "Targets: `fmt` formats, `vet` inspects, `race` detects races.\n",
    "```text\nThe files `a`, `b` and `c`.\n```\n",
  ]) {
    assert.equal(await count(source, rule), 0, source);
  }
});

test("a code run that closes its sentence becomes a list under its lead-in", async () => {
  const rule = "list-comma-code-run";

  await fixesTo(
    "The release touches `config.yaml`, `schema.json`, `Makefile` and `README.md`.\n",
    "The release touches:\n\n- `config.yaml`\n- `schema.json`\n- `Makefile`\n- `README.md`\n",
    rule,
  );
  await fixesTo(
    "It reads `a`, `b`, or `c`. Then it stops.\n",
    "It reads:\n\n- `a`\n- `b`\n- `c`\n\nThen it stops.\n",
    rule,
  );
  await fixesTo("- **Paths:** `a`, `b`, `c`\n", "- **Paths:**\n  - `a`\n  - `b`\n  - `c`\n", rule);
  await fixesTo(
    "- 4 services with no owner: `billing-api`, `search-indexer`, `image-resizer`, `audit-log`.\n",
    "- 4 services with no owner:\n  - `billing-api`\n  - `search-indexer`\n  - `image-resizer`\n  - `audit-log`\n",
    rule,
  );
});

test("a code run without a clean lead-in and tail stays reported", async () => {
  for (const source of [
    "A tag such as `a`, `b` or `c` is a prerelease.\n",
    "`a`, `b` and `c` are built in.\n",
    "See [`a`](u), `b` and `c`.\n",
    "See *`a`, `b` and `c`*.\n",
    "It has three (`a`, `b` and `c`).\n",
    "- It reads `a`, `b` and `c`.\n  Then it stops.\n",
  ]) {
    await refuses(source, "list-comma-code-run");
  }
});

test("plain-word runs need five short items announced by a colon or a final conjunction", async () => {
  const rule = "list-comma-plain-run";

  for (const source of [
    "Tags: alpha, beta, rc, next, canary.\n",
    "It ships red, green, blue, cyan, teal and magenta.\n",
    "Pick red, green, blue, cyan, teal, or magenta.\n",
    "Steps: a signed tag, unit tests, final review, sign off, a green build.\n",
  ]) {
    assert.equal(await count(source, rule), 1, source);
  }

  for (const source of [
    "Tags: alpha, beta, rc, next.\n",
    "It parses, fixes and verifies the tree.\n",
    "Then, after that, in turn, at last, at once, it stops.\n",
    "Tags: alpha, beta, rc, next, the very last one.\n",
    "Sizes: 1, 2, 4, 8, 16.\n",
    "Files: `a`, `b`, `c`, `d`, `e`.\n",
    "Red, green, blue, cyan and magenta are colours.\n",
    "One finding, with a file, a line, a rule and a message.\n",
  ]) {
    assert.equal(await count(source, rule), 0, source);
  }
});

test("a plain-word run after a colon becomes a bullet list", async () => {
  const rule = "list-comma-plain-run";
  const list = "\n\n- alpha\n- beta\n- rc\n- next\n- canary\n";

  await fixesTo("Tags: alpha, beta, rc, next, canary.\n", `Tags:${list}`, rule);
  await fixesTo("Tags: alpha, beta, rc, next and canary.\n", `Tags:${list}`, rule);
  await fixesTo("Tags: alpha, beta, rc, next, and canary.\n", `Tags:${list}`, rule);
  await fixesTo("Supported channels: alpha, beta, rc, next, and canary.\n", `Supported channels:${list}`, rule);
  await fixesTo(
    "- Tags: alpha, beta, rc, next, canary.\n",
    "- Tags:\n  - alpha\n  - beta\n  - rc\n  - next\n  - canary\n",
    rule,
  );
});

test("a plain-word run without a colon or with marked-up items stays reported", async () => {
  for (const source of [
    "It publishes alpha, beta, rc, next, nightly and canary.\n",
    "Tags: alpha, *beta*, rc, next, canary.\n",
    "Tags: alpha, [beta](u), rc, next, canary.\n",
  ]) {
    await refuses(source, "list-comma-plain-run");
  }
});

const SHORT_RUNS: [string, string, number, string][] = [
  ["list-semicolon-delimited-run", "Needs: a tag; a build.\n", 2, "Needs:\n\n- a tag\n- a build\n"],
  [
    "list-comma-labelled-run",
    "Targets: `fmt` formats, `vet` inspects.\n",
    2,
    "Targets:\n\n- `fmt` formats\n- `vet` inspects\n",
  ],
  ["list-comma-code-run", "It reads `a` and `b`.\n", 2, "It reads:\n\n- `a`\n- `b`\n"],
  ["list-comma-plain-run", "Tags: alpha, beta, rc, next.\n", 4, "Tags:\n\n- alpha\n- beta\n- rc\n- next\n"],
  ["list-interpunct-joined-run", "Stack: Bun · Node.\n", 2, "Stack:\n\n- Bun\n- Node\n"],
];

test("minItems lowers a run policy's threshold for its check and its edit", async () => {
  for (const [rule, source, minItems, expected] of SHORT_RUNS) {
    assert.ok(!(await lint(source)).includes(rule), rule);

    const lowered = { [rule]: { minItems } };

    assert.ok((await lint(source, lowered)).includes(rule), rule);
    assert.equal(await fixed(source, lowered), expected);
  }
});

const DEFAULT_RUNS: [string, string, number][] = [
  ["list-semicolon-delimited-run", "Needs: a tag; a build; a log.\n", 4],
  ["list-comma-labelled-run", "Targets: `fmt` formats, `vet` inspects, `race` detects.\n", 4],
  ["list-comma-code-run", "It reads `a`, `b` and `c`.\n", 4],
  ["list-comma-plain-run", "Tags: alpha, beta, rc, next, canary.\n", 6],
  ["list-interpunct-joined-run", "Stack: Bun · Node · biome.\n", 4],
];

test("minItems raises a run policy's threshold for its check and its edit", async () => {
  for (const [rule, source, minItems] of DEFAULT_RUNS) {
    assert.ok((await lint(source)).includes(rule), rule);

    const raised = { [rule]: { minItems } };

    assert.ok(!(await lint(source, raised)).includes(rule), rule);
    assert.ok(!(await fixed(source, raised)).includes("\n- "), rule);
  }
});

test("minItems must be a whole number of at least two", async () => {
  for (const minItems of [1, 2.5, 0, "3"]) {
    await assert.rejects(
      () =>
        lint("Tags: a, b.\n", {
          "list-comma-plain-run": { minItems } as RuleOptions,
        }),
      RangeError,
    );
  }
});
