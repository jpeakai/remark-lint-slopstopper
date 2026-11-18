import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { guardExamples } from "./families.ts";
import { assertOwnedLocation } from "./paths.ts";
import type { AgentOutcome } from "./repair.ts";
import { describeDiagnostic, type LintDiagnostic, strictLint } from "./strict.ts";

// After an Agent exits, every post-check runs on its own, so one failure can
// never hide another. The report records each result beside the Agent's exit.

export type PostCheckName = "family" | "lint" | "renders" | "scope";

export interface PostCheck {
  name: PostCheckName;
  passed: boolean;
  problems: string[];
}

export interface RepairReport {
  examples: string[];
  agent: { code: number | null; signal: string | null; cancelled: string | null };
  checks: PostCheck[];

  // Every strict-mode Diagnostic, including those of the combined document.
  lint: LintDiagnostic[];
  passed: boolean;
}

// Run each step to completion, recording a thrown error as that step's failure.
export async function runPostChecks(
  steps: ReadonlyArray<readonly [PostCheckName, () => Promise<string[]>]>,
): Promise<PostCheck[]> {
  const checks: PostCheck[] = [];

  for (const [name, step] of steps) {
    const problems = await step().catch((error: unknown) => [error instanceof Error ? error.message : String(error)]);

    checks.push({ name, passed: problems.length === 0, problems });
  }

  return checks;
}

const exampleDirs = async (root: string) =>
  (await readdir(join(root, "examples"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d{2,}-/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

// Each unselected example's repaired output, before the Agent runs.
export async function snapshotUnselected(root: string, names: readonly string[]): Promise<Map<string, string | null>> {
  const others = (await exampleDirs(root)).filter((name) => !names.includes(name));

  return new Map(
    await Promise.all(
      others.map(
        async (name) =>
          [name, await readFile(join(root, "examples", name, "diagram-fixed.md"), "utf8").catch(() => null)] as const,
      ),
    ),
  );
}

export async function scopeProblems(root: string, before: ReadonlyMap<string, string | null>): Promise<string[]> {
  const problems: string[] = [];

  for (const [name, source] of before) {
    const now = await readFile(join(root, "examples", name, "diagram-fixed.md"), "utf8").catch(() => null);

    if (now !== source) {
      problems.push(`unselected example ${name} changed`);
    }
  }

  return problems;
}

export interface RepairCheckPlan {
  root: string;
  names: readonly string[];
  agent: AgentOutcome;
  before: ReadonlyMap<string, string | null>;

  // Renders the selected comparisons and returns their failures.
  renders: () => Promise<string[]>;
}

export async function repairReport(plan: RepairCheckPlan): Promise<RepairReport> {
  let lint: LintDiagnostic[] = [];
  const checks = await runPostChecks([
    ["family", () => guardExamples(plan.root, plan.names)],
    [
      "lint",
      async () => {
        lint = (await strictLint(plan.root, plan.names)).diagnostics;

        return lint.map(describeDiagnostic);
      },
    ],
    ["renders", plan.renders],
    ["scope", () => scopeProblems(plan.root, plan.before)],
  ]);
  const { code, signal, cancelled } = plan.agent;

  return {
    examples: [...plan.names],
    agent: { code, signal, cancelled },
    checks,
    lint,
    passed: code === 0 && checks.every((check) => check.passed),
  };
}

export async function writeReport(root: string, path: string, report: RepairReport): Promise<void> {
  await assertOwnedLocation(root, path);
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
}

export function reportFailure(report: RepairReport): string | null {
  const failed = report.checks.filter((check) => !check.passed);

  if (!failed.length) {
    return null;
  }

  return `Repaired diagrams failed post-checks:\n${failed
    .map((check) => `${check.name}:\n${check.problems.map((problem) => `  ${problem}`).join("\n")}`)
    .join("\n")}`;
}
