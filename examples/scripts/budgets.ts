import { parse } from "yaml";
import { createDocument } from "../../src/document/context.ts";
import { analyzeSurfaces } from "../../src/mermaid/contrast/analysis.ts";
import { GITHUB_CANVAS } from "../../src/mermaid/contrast/theme.ts";
import { fences } from "../../src/mermaid/markdown.ts";
import { extractStats } from "../../src/mermaid/parsing/statistics.ts";
import type { Diagnostic } from "../../src/types.ts";

// Finding budgets bound what each comparison example may report, so a known
// renderer limitation stays covered by a precise regression test instead of a
// broad exclusion. They never suppress what the plugin reports to users.

export const MERMAID_POLICIES = [
  "mermaid/contrast-text-below-aa",
  "mermaid/contrast-connectors-below-minimum",
  "mermaid/complexity-visual-score-acceptable-exceeded",
  "mermaid/parse-diagram-unparseable",
] as const;

// Surfaces that name a whole diagram rather than one painted element.
const WHOLE_DIAGRAM = ["unauditable", "diagram"];

export interface FindingKey {
  rule: string;
  surface: string;
  theme?: "light" | "dark";
}

export interface Budget extends FindingKey {
  max: number;
  reason: string;
}

export type Budgets = Readonly<Record<string, readonly Budget[]>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Each field's problem, or null when the value is valid.
const FIELD_CHECKS: Record<keyof Budget, (value: unknown) => string | null> = {
  rule: (value) =>
    MERMAID_POLICIES.includes(value as (typeof MERMAID_POLICIES)[number])
      ? null
      : `names an unexpected rule ${String(value)}`,
  surface: (value) => (typeof value === "string" && value ? null : "needs a surface"),
  theme: (value) =>
    value === undefined || value === "light" || value === "dark" ? null : "theme must be light or dark",
  max: (value) =>
    Number.isInteger(value) && (value as number) >= 1 ? null : "max must be a whole number of at least 1",
  reason: (value) => (typeof value === "string" && value.trim() ? null : "needs a reason"),
};

function budgetEntry(example: string, raw: unknown, index: number): Budget {
  const where = `${example}[${index}]`;

  if (!isRecord(raw)) {
    throw new Error(`${where} is not a budget entry`);
  }

  const extra = Object.keys(raw).filter((key) => !(key in FIELD_CHECKS));

  if (extra.length) {
    throw new Error(`${where} has unknown keys ${extra.join(", ")}`);
  }

  for (const [field, check] of Object.entries(FIELD_CHECKS)) {
    const problem = check(raw[field]);

    if (problem) {
      throw new Error(`${where} ${problem}`);
    }
  }

  return raw as unknown as Budget;
}

export function loadBudgets(text: string): Budgets {
  const data: unknown = parse(text);

  if (!isRecord(data)) {
    throw new Error("Finding budgets must map example folders to entries");
  }

  return Object.fromEntries(
    Object.entries(data).map(([example, entries]) => {
      if (!Array.isArray(entries)) {
        throw new Error(`${example} must list budget entries`);
      }

      return [example, entries.map((entry, index) => budgetEntry(example, entry, index))];
    }),
  );
}

export function findingKey(finding: Diagnostic): FindingKey {
  const head = finding.message.split(": ")[0] ?? "";
  const theme = finding.message.match(/ in the (light|dark) theme /)?.[1] as FindingKey["theme"];

  if (finding.ruleId === "mermaid/parse-diagram-unparseable" || finding.ruleId.includes("complexity")) {
    return { rule: finding.ruleId, surface: "diagram" };
  }

  if (/cannot be audited/.test(head)) {
    return { rule: finding.ruleId, surface: "unauditable" };
  }

  return { rule: finding.ruleId, surface: head, ...(theme ? { theme } : {}) };
}

const sameKey = (a: FindingKey, b: FindingKey) => a.rule === b.rule && a.surface === b.surface && a.theme === b.theme;

const describe = (key: FindingKey) => `${key.rule} ${key.surface}${key.theme ? ` (${key.theme})` : ""}`;

// Every surface name the Surface Analysis can report for an example, so a
// budget naming a misspelt or vanished surface is rejected even at zero.
export async function knownSurfaces(markdown: string): Promise<Set<string>> {
  const names = new Set(WHOLE_DIAGRAM);

  for (const fence of fences(createDocument(markdown))) {
    const analysis = await analyzeSurfaces(fence.value, await extractStats(fence.value), {
      name: "github",
      canvas: GITHUB_CANVAS,
    });

    for (const surface of analysis.surfaces) {
      names.add(surface.name);
    }
  }

  return names;
}

export function checkBudget(
  example: string,
  findings: readonly Diagnostic[],
  budget: readonly Budget[],
  surfaces: ReadonlySet<string>,
): string[] {
  const problems = budget
    .filter((entry) => !surfaces.has(entry.surface))
    .map((entry) => `${example}: budget names an unknown surface: ${describe(entry)}`);
  const counts = new Map<Budget, number>();

  for (const finding of findings) {
    const key = findingKey(finding);
    const entry = budget.find((item) => sameKey(item, key));

    if (entry) {
      counts.set(entry, (counts.get(entry) ?? 0) + 1);
    } else {
      problems.push(`${example}: unexpected finding ${describe(key)}: ${finding.message.slice(0, 120)}`);
    }
  }

  for (const [entry, count] of counts) {
    if (count > entry.max) {
      problems.push(`${example}: ${describe(entry)} reported ${count} findings, over its allowance of ${entry.max}`);
    }
  }

  return problems;
}
