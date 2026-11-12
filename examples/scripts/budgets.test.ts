import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { VFile } from "vfile";
import { analyzeMermaid } from "../../src/mermaid/analyze.ts";
import remarkSlopstopper from "../../src/remark/plugin.ts";
import { MERMAID_RULES, PROSE_RULES } from "../../src/rules.ts";
import type { Diagnostic } from "../../src/types.ts";
import { type Budget, checkBudget, knownSurfaces, loadBudgets } from "./budgets.ts";

const examples = fileURLToPath(new URL("../", import.meta.url));
const MERMAID_ONLY = { rules: MERMAID_RULES };
const RADAR = "22-radar--fulfilment-capability-comparison--radar-axes-legend-labels";

const budgets = loadBudgets(await readFile(`${examples}finding-budgets.yml`, "utf8"));
const names = (await readdir(examples, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^\d{2,}-/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const comparisons = new Map(
  await Promise.all(
    names.map(async (name) => [name, await readFile(`${examples}${name}/diagram-fixed.md`, "utf8")] as const),
  ),
);
const findings = new Map<string, Diagnostic[]>();

for (const [name, markdown] of comparisons) {
  findings.set(name, await analyzeMermaid(markdown, MERMAID_ONLY));
}

const radar = () => ({ markdown: comparisons.get(RADAR) ?? "", found: findings.get(RADAR) ?? [] });

test("every comparison stays within its finding budget", async () => {
  const problems: string[] = [];

  for (const [name, markdown] of comparisons) {
    problems.push(...checkBudget(name, findings.get(name) ?? [], budgets[name] ?? [], await knownSurfaces(markdown)));
  }

  assert.deepEqual(problems, []);
  assert.deepEqual(
    Object.keys(budgets).filter((name) => !comparisons.has(name)),
    [],
    "every budget names an existing example",
  );
});

test("a finding without an entry, or over its allowance, is rejected", async () => {
  const { markdown, found } = radar();
  const surfaces = await knownSurfaces(markdown);
  const full = budgets[RADAR] ?? [];
  const tight = full.map((entry) => ({ ...entry, max: 1 }));
  const doubled = [...found, ...found.slice(0, 1)];

  assert.match(
    checkBudget(RADAR, found, full.slice(1), surfaces).join("\n"),
    /unexpected finding .* axis speed \(dark\)/,
  );
  assert.match(checkBudget(RADAR, doubled, tight, surfaces).join("\n"), /reported 2 findings, over its allowance of 1/);
});

test("an unknown surface or unexpected rule is rejected even with no findings", async () => {
  const { markdown } = radar();
  const misspelt: Budget = {
    rule: "mermaid/contrast-text-below-aa",
    surface: "axis sped",
    theme: "dark",
    max: 1,
    reason: "typo",
  };

  assert.match(
    checkBudget(RADAR, [], [misspelt], await knownSurfaces(markdown)).join("\n"),
    /unknown surface: .* axis sped/,
  );
  assert.throws(
    () => loadBudgets(`${RADAR}:\n  - rule: prose/sentence-one-per-line\n    surface: x\n    max: 1\n    reason: r\n`),
    /unexpected rule prose\/sentence-one-per-line/,
  );
  assert.throws(
    () =>
      loadBudgets(`${RADAR}:\n  - rule: mermaid/contrast-text-below-aa\n    surface: x\n    max: 0\n    reason: r\n`),
    /max must be/,
  );
});

test("fewer findings than budgeted pass, so a resolved limitation needs no edit", async () => {
  const { markdown, found } = radar();

  assert.deepEqual(checkBudget(RADAR, found.slice(2), budgets[RADAR] ?? [], await knownSurfaces(markdown)), []);
  assert.deepEqual(checkBudget(RADAR, [], budgets[RADAR] ?? [], await knownSurfaces(markdown)), []);
});

test("budgeted findings stay fatal errors through the remark adapter", async () => {
  const { markdown, found } = radar();
  const quiet = Object.fromEntries(PROSE_RULES.map((rule) => [rule.split("/")[1], false]));
  const processor = unified().use(remarkParse).use(remarkSlopstopper, { rules: quiet });
  const file = new VFile({ value: markdown });

  await processor.run(processor.parse(file), file);

  assert.equal(file.messages.length, found.length);
  assert.ok(file.messages.every((message) => message.fatal === true));
  assert.deepEqual(
    file.messages.map((message) => message.reason).sort(),
    found.map((finding) => finding.message).sort(),
  );
});

test("a combined document reports exactly what each example reports alone", async () => {
  const separator = "\n\n";
  const offsets: [string, number][] = [];
  let combined = "";

  for (const [name, markdown] of comparisons) {
    offsets.push([name, combined.length]);
    combined += markdown + separator;
  }

  const together = await analyzeMermaid(combined, MERMAID_ONLY);

  for (const [index, [name, start]] of offsets.entries()) {
    const end = offsets[index + 1]?.[1] ?? combined.length;
    const mine = together
      .filter((finding) => finding.start >= start && finding.start < end)
      .map((finding) => [finding.message, finding.start - start, finding.end - start]);
    const alone = (findings.get(name) ?? []).map((finding) => [finding.message, finding.start, finding.end]);

    assert.deepEqual(mine, alone, name);
  }
});

test("budget reasons survive YAML intact, including colour values", () => {
  assert.ok(
    (budgets[RADAR] ?? []).every((entry) => entry.reason.endsWith("#333333 on the dark page")),
    "an unquoted # starts a YAML comment and truncates the reason",
  );
});
