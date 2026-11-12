import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { VFile } from "vfile";
import { createDocument } from "../../src/document/context.ts";
import { analyzeMermaid } from "../../src/mermaid/analyze.ts";
import { fences } from "../../src/mermaid/markdown.ts";
import { extractStats } from "../../src/mermaid/parsing/statistics.ts";
import remarkSlopstopper from "../../src/remark/plugin.ts";
import { MERMAID_RULES } from "../../src/rules.ts";
import { type Budgets, checkBudget, findingKey, knownSurfaces } from "./budgets.ts";
import { factProblems } from "./facts.ts";
import { guardExample, normalFamily, type Translation } from "./families.ts";
import type { Manifest } from "./render.ts";

// Each comparison is accepted on its own evidence, so a change in one example
// cannot hide behind an aggregate pass over all of them.

export interface Check {
  name: "family" | "facts" | "findings" | "renders" | "site";
  passed: boolean;
  problems: string[];
}

export interface AcceptanceRecord {
  example: string;
  accepted: boolean;
  checks: Check[];

  // Reasons for the budgeted findings this comparison still reports.
  limitations: string[];

  // The approved Portable Translation it keeps, if any.
  translation?: string;
}

export interface AcceptanceContext {
  budgets: Budgets;
  translations: Readonly<Record<string, Translation>>;
  renders: Manifest;
  site: string;
}

const check = (name: Check["name"], problems: string[]): Check => ({ name, passed: !problems.length, problems });

async function familyOf(source: string): Promise<string> {
  return normalFamily((await extractStats(source)).diagram_type);
}

// A Portable Translation's facts are checked by its family guard; every other
// comparison must keep its original's facts directly.
async function factsCheck(original: string, comparisons: string[], translation?: Translation): Promise<Check> {
  const families = await Promise.all(comparisons.map(familyOf));
  const translated = translation !== undefined && families.includes(translation.to);

  return check("facts", translated ? [] : await factProblems(original, comparisons));
}

// Every package policy over the whole file, as a user runs it. Diagram
// findings must fit the example's budget; prose findings have none.
async function findingsCheck(example: string, markdown: string, budgets: Budgets) {
  const processor = unified().use(remarkParse).use(remarkSlopstopper);
  const file = new VFile({ value: markdown });

  await processor.run(processor.parse(file), file);

  const prose = file.messages.filter((message) => !MERMAID_RULES.some((rule) => rule.endsWith(`/${message.ruleId}`)));
  const diagram = await analyzeMermaid(markdown, { rules: MERMAID_RULES });
  const budget = budgets[example] ?? [];
  const problems = [
    ...prose.map((message) => `prose ${message.ruleId}: ${message.reason}`),
    ...checkBudget(example, diagram, budget, await knownSurfaces(markdown)),
  ];
  const used = new Set(diagram.map((finding) => JSON.stringify(findingKey(finding))));
  const limitations = budget
    .filter((entry) =>
      used.has(
        JSON.stringify({ rule: entry.rule, surface: entry.surface, ...(entry.theme ? { theme: entry.theme } : {}) }),
      ),
    )
    .map((entry) => `${entry.surface}${entry.theme ? ` (${entry.theme})` : ""}: ${entry.reason}`);

  return { check: check("findings", problems), limitations: [...new Set(limitations)] };
}

function rendersCheck(example: string, renders: Manifest): Check {
  const mine = (scenario: string) => scenario.startsWith(`${example}#`) || scenario === example;
  const problems = renders.failures
    .filter((failure) => mine(failure.scenario))
    .map((f) => `${f.scenario}: ${f.reason}`);

  if (!renders.artifacts.some((artifact) => artifact.example === example)) {
    problems.push(`no verified render artifacts for ${example}`);
  }

  return check("renders", problems);
}

// The built site must show the example's page and offer both sources unchanged.
async function siteCheck(root: string, example: string, site: string): Promise<Check> {
  const problems: string[] = [];

  if (!(await stat(join(site, "examples", example, "index.html")).catch(() => null))?.isFile()) {
    problems.push(`the site has no page for ${example}`);
  }

  for (const file of ["diagram.md", "diagram-fixed.md"]) {
    const download = await readFile(join(site, "assets", "examples", example, `${file}.txt`), "utf8").catch(() => null);
    const source = await readFile(join(root, "examples", example, file), "utf8");

    if (download !== source) {
      problems.push(
        download === null ? `the site offers no ${file} download` : `the ${file} download differs from its source`,
      );
    }
  }

  return check("site", problems);
}

export async function acceptExample(root: string, example: string, ctx: AcceptanceContext): Promise<AcceptanceRecord> {
  const read = (file: string) => readFile(join(root, "examples", example, file), "utf8");
  const [originalMarkdown, markdown] = await Promise.all([read("diagram.md"), read("diagram-fixed.md")]);
  const original = fences(createDocument(originalMarkdown))[0]?.value ?? "";
  const comparisons = fences(createDocument(markdown)).map((fence) => fence.value);
  const translation = ctx.translations[example];
  const findings = await findingsCheck(example, markdown, ctx.budgets);
  const checks = [
    check("family", await guardExample(root, example, translation)),
    await factsCheck(original, comparisons, translation),
    findings.check,
    rendersCheck(example, ctx.renders),
    await siteCheck(root, example, ctx.site),
  ];

  return {
    example,
    accepted: checks.every((item) => item.passed),
    checks,
    limitations: findings.limitations,
    ...(translation ? { translation: `${translation.from} to ${translation.to}: ${translation.reason}` } : {}),
  };
}
