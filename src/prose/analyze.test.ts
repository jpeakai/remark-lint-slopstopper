import assert from "node:assert/strict";
import { test } from "node:test";
import type { Diagnostic } from "../types.ts";
import { analyzeProse } from "./analyze.ts";

const layout = async (source: string) =>
  (await analyzeProse(source)).filter((d) => d.ruleId.endsWith("/sentence-one-per-line"));
const apply = (source: string, diagnostics: Diagnostic[]) =>
  diagnostics
    .flatMap((d) => (d.fix ? [d.fix] : []))
    .sort((a, b) => b.start - a.start)
    .reduce((text, fix) => text.slice(0, fix.start) + fix.text + text.slice(fix.end), source);

test("whitespace edits split sentences and join soft wraps without serializing Markdown", async () => {
  const source = "# Heading #\n\nA sentence. Another\nwrapped sentence.\n";
  const fixed = apply(source, await layout(source));

  assert.equal(fixed, "# Heading #\n\nA sentence.\nAnother wrapped sentence.\n");
  assert.deepEqual(await layout(fixed), []);
});

test("abbreviations, decimals, inline code and link destinations do not create sentence splits", async () => {
  const source =
    "Dr. Smith paid 3.14 dollars for `example. Code`. Read [the guide](https://example.com/a.b). Another sentence.";
  const fixed = apply(source, await layout(source));

  assert.equal(
    fixed,
    "Dr. Smith paid 3.14 dollars for `example. Code`.\nRead [the guide](https://example.com/a.b).\nAnother sentence.",
  );
});

test("entities and escaped punctuation retain exact source offsets and bytes", async () => {
  const source = "First sentence. Second &amp; third sentence. Another \\*literal\\* sentence.";

  assert.equal(
    apply(source, await layout(source)),
    "First sentence.\nSecond &amp; third sentence.\nAnother \\*literal\\* sentence.",
  );

  const encoded = await layout("First sentence.&nbsp;Second sentence.");

  assert.equal(encoded.length, 1);
  assert.equal(encoded[0].fix, undefined);
});

test("closing quotation marks do not hide sentence boundaries", async () => {
  const source = 'He said "yes." Another sentence.';

  assert.equal(apply(source, await layout(source)), 'He said "yes."\nAnother sentence.');
});

test("code blocks, frontmatter, HTML and table cells are outside running prose", async () => {
  const source =
    "---\nsummary: One sentence. Another sentence.\n---\n\n```js\nOne sentence. Another sentence.\n```\n\n<div>One sentence. Another sentence.</div>\n\n| Name |\n| --- |\n| One sentence. Another sentence. |";

  assert.deepEqual(await analyzeProse(source), []);
});

test("lists preserve indentation and Unicode offsets use UTF-16 source indexes", async () => {
  const source = "- 😀 First sentence. Second sentence.\n";

  const findings = await layout(source);

  assert.equal(findings[0].start, source.indexOf(" Second"));
  assert.equal(apply(source, findings), "- 😀 First sentence.\n  Second sentence.\n");
});

test("existing list continuation indentation is preserved when joining a wrap", async () => {
  const source = "- First\n  sentence. Second sentence.";

  assert.equal(apply(source, await layout(source)), "- First sentence.\n  Second sentence.");
});

test("nested blockquotes and explicit hard breaks never receive whitespace fixes", async () => {
  for (const source of [
    "> > First sentence. Second sentence.",
    "A sentence  \ncontinues. Another sentence.",
    "A sentence\\\ncontinues. Another sentence.",
  ]) {
    const findings = await layout(source);

    assert.ok(findings.length);
    assert.ok(findings.every((d) => !d.fix));
  }
});

test("a split that would create a list is lint-only", async () => {
  const source = "He finished. 1. This remains prose.";
  const fixed = apply(source, await layout(source));

  assert.ok(!fixed.includes("\n1."));
});

test("CRLF source retains CRLF and one-sentence lines are stable", async () => {
  const source = "First sentence. Another\r\nwrapped sentence.\r\n";
  const fixed = apply(source, await layout(source));

  assert.equal(fixed, "First sentence.\r\nAnother wrapped sentence.\r\n");
  assert.deepEqual(await layout(fixed), []);
});

test("CR-only sentence lines remain stable and new splits retain CR", async () => {
  assert.deepEqual(await layout("First sentence.\rSecond sentence."), []);

  const source = "First sentence. Second sentence.\r";

  assert.equal(apply(source, await layout(source)), "First sentence.\rSecond sentence.\r");
});

test("word-budget guidance uses clause and verb signals without autofixing words", async () => {
  const source =
    "The parser reads every input because the worker validates each request, and the service stores all results while the client waits for the response to arrive.";
  const finding = (await analyzeProse(source)).find((d) => d.ruleId.endsWith("/sentence-word-budget-exceeded"));

  assert.ok(finding);
  assert.match(finding.message, /budget 25/);
  assert.match(finding.message, /[3-9] potential clauses/);
  assert.match(finding.message, /about [3-9] shorter sentences/);
  assert.equal(finding.fix, undefined);
  assert.equal(finding.start, 0);
  assert.equal(finding.end, source.length);
});

test("paragraph guidance names lexical cues and budget-respecting break candidates", async () => {
  const source =
    "The parser reads Markdown. The parser produces nodes. Those nodes carry positions. The server stores requests. Requests contain user messages. The server validates messages.";
  const finding = (await analyzeProse(source, { maxSentences: 3 })).find((d) =>
    d.ruleId.endsWith("/paragraph-sentence-budget-exceeded"),
  );

  assert.ok(finding);
  assert.match(finding.message, /6 sentences \(budget 3\)/);
  assert.match(finding.message, /breaks after sentences 3/);
  assert.match(finding.message, /parser/);
  assert.match(finding.message, /server/);
  assert.match(finding.message, /not semantic certainty/);
  assert.equal(finding.fix, undefined);
});

test("invalid options fail before creating unbounded split plans", async () => {
  for (const value of [0, -1, 1.5, Number.NaN, "5"]) {
    await assert.rejects(
      () => Reflect.apply(analyzeProse, undefined, ["A sentence.", { maxSentences: value }]),
      RangeError,
    );
  }
});

test("word findings cover entire final entities and inline-code source spans", async () => {
  for (const source of [
    "One two three four &amp;",
    "One two three four &#x1f600;",
    "One two three four `value with spaces`",
  ]) {
    const findings = await analyzeProse(source, {
      maxWords: 3,
      rules: ["prose/sentence-word-budget-exceeded"],
    });

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.start, 0);
    assert.equal(findings[0]?.end, source.length);
  }
});

test("disabled policies never validate another policy's budget", async () => {
  const source = "First sentence. Second sentence.";

  assert.deepEqual(await analyzeProse(source, { rules: [], maxWords: 0, maxSentences: 0 }), []);

  const layoutOnly = await analyzeProse(source, {
    rules: ["prose/sentence-one-per-line"],
    maxWords: 0,
    maxSentences: 0,
  });

  assert.equal(layoutOnly.length, 1);

  const wordsOnly = await analyzeProse(source, {
    rules: ["prose/sentence-word-budget-exceeded"],
    maxWords: 1,
    maxSentences: 0,
  });

  assert.equal(wordsOnly.length, 2);

  const paragraphsOnly = await analyzeProse(source, {
    rules: ["prose/paragraph-sentence-budget-exceeded"],
    maxWords: 0,
    maxSentences: 1,
  });

  assert.equal(paragraphsOnly.length, 1);
});
