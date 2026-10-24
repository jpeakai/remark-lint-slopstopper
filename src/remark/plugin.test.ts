import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { VFile } from "vfile";
import { createDocument } from "../document/context.ts";
import { pointAt } from "../document/positions.ts";
import { fences } from "../mermaid/markdown.ts";
import { RULES } from "../rules.ts";
import type { RemarkSlopstopperOptions, RemarkRuleSetting } from "./plugin.ts";
import remarkSlopstopper from "./plugin.ts";

const options = { maxWords: 8, maxSentences: 2, preset: "low-density" };
const graph =
  "flowchart LR\n" +
  Array.from({ length: 25 }, (_, i) => `N${i}-->N${i + 1}`).join("\n") +
  "\nstyle N0 fill:#fff,color:#fff";
const fixture =
  "# Probe #\n\nThe worker reads the queue because it needs a task and then it starts the next job. The worker logs its result. The scheduler starts another worker.\n\n```mermaid\n" +
  graph +
  "\n```\n";

test("prose-only remark execution does not install Mermaid's browser globals", () => {
  const result = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import assert from "node:assert/strict";
    import remarkParse from "remark-parse";
    import { unified } from "unified";
    import { VFile } from "vfile";
    import plugin from ${JSON.stringify(new URL("./plugin.ts", import.meta.url).href)};
    assert.equal(globalThis.window, undefined);
    const processor = unified().use(remarkParse).use(plugin, {
      rules: {
        "contrast-text-below-aa": false,
        "complexity-visual-score-acceptable-exceeded": false
      }
    });
    const file = new VFile("First sentence. Second sentence.");
    await processor.run(processor.parse(file), file);
    assert.ok(file.messages.some(message => message.ruleId === "sentence-one-per-line"));
    assert.equal(globalThis.window, undefined);
  `,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result, "");
});

function processor(fix = false, rules?: RemarkSlopstopperOptions["rules"]) {
  return unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(remarkSlopstopper, { fix, options, rules });
}

test("all five policies report native remark errors by default", async () => {
  const file = await processor().process(fixture);
  assert.deepEqual(
    [...new Set(file.messages.map((message) => message.ruleId))].sort(),
    RULES.map((id) => id.split("/")[1]).sort(),
  );
  assert.ok(
    file.messages.every(
      (message) => message.fatal === true && message.source === "remark-lint",
    ),
  );
});

test("sentence fixes preserve headings, code, CRLF and stable output", async () => {
  const source =
    "# Probe #\r\n\r\nFirst sentence. Second sentence.\r\n\r\n```js\r\nconst unchanged = 'First. Second.';\r\n```\r\n";
  const expected = source.replace(
    "First sentence. Second sentence.",
    "First sentence.\r\nSecond sentence.",
  );
  assert.equal(String(await processor(true).process(source)), expected);
  assert.equal(String(await processor(true).process(expected)), expected);
});

test("soft-wrap joins preserve list indentation and stabilise with sentence splits", async () => {
  const source =
    "# Probe #\n\n- This sentence wraps\n  across two lines. Another sentence.\n";
  const expected =
    "# Probe #\n\n- This sentence wraps across two lines.\n  Another sentence.\n";
  assert.equal(String(await processor(true).process(source)), expected);
  assert.equal(String(await processor(true).process(expected)), expected);
});

test("lint-only transformation preserves source and never records applied edits", async () => {
  const remark = processor();
  const file = new VFile(fixture);
  await remark.run(remark.parse(file), file);
  assert.equal(String(file), fixture);
  assert.equal(file.data.slopstopperFixes, undefined);
  assert.ok(file.messages.length > 0);
});

test("identical source in different host ASTs never reuses stale diagnostics", async () => {
  const source = "First sentence. Second sentence.\n";
  const remark = unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(() => (tree: Root, file: VFile) => {
      if (file.path === "heading.md") {
        tree.children = tree.children.map((node) =>
          node.type === "paragraph"
            ? { ...node, type: "heading", depth: 2 }
            : node,
        );
      }
    })
    .use(remarkSlopstopper);
  const paragraph = await remark.process({
    value: source,
    path: "paragraph.md",
  });
  assert.ok(
    paragraph.messages.some(
      (message) => message.ruleId === "sentence-one-per-line",
    ),
  );
  const heading = await remark.process({ value: source, path: "heading.md" });
  assert.equal(heading.messages.length, 0);
});

test("lint-only Mermaid policies never change diagrams in fix mode", async () => {
  const source = ["```mermaid", graph, "```", ""].join("\n");
  const file = await processor(true).process(source);
  assert.equal(String(file), source);
  assert.deepEqual(file.data.slopstopperFixes, []);
  assert.ok(
    file.messages.some(
      (message) => message.ruleId === "contrast-text-below-aa",
    ),
  );
  assert.ok(
    file.messages.some(
      (message) =>
        message.ruleId === "complexity-visual-score-acceptable-exceeded",
    ),
  );
});

test("native suppression prevents sentence diagnostics and fixes", async () => {
  const source =
    "<!--lint disable sentence-one-per-line-->\n\nFirst sentence. Second sentence.\n";
  const file = await processor(true).process(source);
  assert.equal(String(file), source);
  assert.equal(file.messages.length, 0);
});

test("frontmatter offsets and source bytes survive sentence fixes", async () => {
  const source =
    "---\ntitle: 'Ignore. This.'\n---\n\nFirst sentence. Second sentence.\n";
  const found = (await processor().process(source)).messages.find(
    (message) => message.ruleId === "sentence-one-per-line",
  );
  assert.ok(found);
  assert.equal(found.line, 5);
  assert.equal(
    String(await processor(true).process(source)),
    source.replace("First sentence. Second", "First sentence.\nSecond"),
  );
});

test("native positions preserve UTF-16 columns with Unicode and CRLF", async () => {
  const source = "# Header\r\n\r\n😀 First sentence. Second sentence.\r\n";
  const file = await processor().process(source);
  const found = file.messages.find(
    (message) => message.ruleId === "sentence-one-per-line",
  );
  assert.ok(found);
  const start = source.indexOf(" Second");
  assert.equal(found.line, 3);
  assert.equal(found.column, start - source.lastIndexOf("\n", start));
  assert.ok(found.place && "start" in found.place);
  assert.equal(found.place.start.offset, start);
});

test("each enabled Mermaid policy reports malformed diagrams", async () => {
  const source = "```mermaid\nflowchart LR\nA-->\n```\n";
  const file = await processor().process(source);
  const messages = file.messages.filter((message) =>
    message.reason.includes("Cannot evaluate"),
  );
  assert.deepEqual(messages.map((message) => message.ruleId).sort(), [
    "complexity-visual-score-acceptable-exceeded",
    "contrast-text-below-aa",
  ]);
  assert.ok(messages.every((message) => message.fatal === true));
});

test("a Mermaid policy reports parser failures when enabled alone", async () => {
  const source = "```mermaid\nflowchart LR\nA-->\n```\n";
  const rules = Object.fromEntries(
    RULES.map((id) => [
      id.split("/")[1],
      id.endsWith("contrast-text-below-aa"),
    ]),
  );
  const file = await processor(false, rules).process(source);
  assert.equal(file.messages.length, 1);
  assert.match(file.messages[0].reason, /Cannot evaluate.*cannot parse/);
});

test("enabled settings always report errors and disabled policies stay silent", async () => {
  const source = "First sentence. Second sentence.\n";
  const enabled: RemarkRuleSetting[] = [
    true,
    {},
    2,
    "error",
    [2, {}],
    ["error", {}],
  ];
  const disabled: RemarkRuleSetting[] = [false, 0, "off", [0, {}], ["off", {}]];
  for (const setting of [...enabled, ...disabled]) {
    const file = await processor(false, {
      "sentence-one-per-line": setting,
    }).process(source);
    const messages = file.messages.filter(
      (message) => message.ruleId === "sentence-one-per-line",
    );
    assert.equal(messages.length, enabled.includes(setting) ? 1 : 0);
    assert.ok(messages.every((message) => message.fatal === true));
  }
});

test("frontmatter comment text cannot suppress document policies", async () => {
  const source =
    "---\n<!--lint disable sentence-one-per-line-->\n---\n\nFirst sentence. Second sentence.\n";
  const file = await processor(false, {
    "sentence-one-per-line": [2, {}],
  }).process(source);
  const found = file.messages.find(
    (message) => message.ruleId === "sentence-one-per-line",
  );
  assert.ok(found);
  assert.equal(found.fatal, true);
  assert.equal(
    String(await processor(true).process(source)),
    source.replace("First sentence. Second", "First sentence.\nSecond"),
  );
});

test("multiple realistic diagrams retain separate scores, positions and styles", async () => {
  const source = readFileSync(
    new URL("../../examples/multiple-diagrams.md", import.meta.url),
    "utf8",
  );
  const rules = Object.fromEntries(
    RULES.map((id) => [id.split("/")[1], id.startsWith("mermaid/")]),
  );
  const file = await processor(false, rules).process(source);
  const clean = fences(createDocument(source))[3];
  assert.ok(clean);
  const cleanStart = pointAt(source, clean.start).line;
  const cleanEnd = pointAt(source, clean.end).line;
  const complex = file.messages.filter(
    (message) =>
      message.ruleId === "complexity-visual-score-acceptable-exceeded" &&
      (message.line ?? 0) < cleanStart,
  );
  assert.equal(complex.length, 2);
  assert.match(complex[0].reason, /VCS 62\.7.*contract verified/s);
  assert.match(complex[1].reason, /VCS 65.*contract verified/s);
  assert.ok((complex[0].line ?? 0) < (complex[1].line ?? 0));
  const badLine = source
    .slice(0, source.indexOf("  style A fill"))
    .split("\n").length;
  const contrast = file.messages.filter(
    (message) =>
      message.ruleId === "contrast-text-below-aa" && message.line === badLine,
  );
  assert.equal(contrast.length, 2);
  assert.ok(
    contrast.every(
      (message) =>
        message.reason.includes("A: text #ffffff") &&
        message.reason.includes("1.00:1"),
    ),
  );
  assert.ok((contrast[0].line ?? 0) > (complex[1].line ?? 0));
  assert.ok(
    file.messages.every(
      (message) =>
        (message.line ?? 0) < cleanStart || (message.line ?? 0) > cleanEnd,
    ),
    "Earlier diagram styles must not leak into later diagrams sharing a node ID",
  );
});
