#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { guardExamples } from "./families.ts";
import { assertOwnedLocation, ownedOutput } from "./paths.ts";
import { runPostChecks } from "./postchecks.ts";
import { exampleNames, resolveBrowser } from "./render.ts";
import { renderProblems } from "./repair.ts";
import { describeDiagnostic, type LintDiagnostic, strictLint } from "./strict.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const HELP = `Usage: bun run validate:examples [example ...] [--render] [--report FILE]

Validate the current repaired outputs strictly: each example keeps its family
and facts, and every comparison, alone and combined, reports zero Diagnostics
through the package's remark adapter. No Finding Budget applies.

Options:
  --render       Also render every comparison across the full matrix (needs a browser)
  --report FILE  Write a machine-readable report inside tmp/
  -h, --help     Show this help and exit`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      render: { type: "boolean", default: false },
      report: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    console.log(HELP);

    return;
  }

  const names = await exampleNames(ROOT, positionals);
  let lint: LintDiagnostic[] = [];
  const steps: [Parameters<typeof runPostChecks>[0][number][0], () => Promise<string[]>][] = [
    ["family", () => guardExamples(ROOT, names)],
    [
      "lint",
      async () => {
        lint = (await strictLint(ROOT, names)).diagnostics;

        return lint.map(describeDiagnostic);
      },
    ],
  ];

  if (values.render) {
    const out = await ownedOutput(
      ROOT,
      join(ROOT, "tmp", "validation", new Date().toISOString().replace(/[:.]/g, "-")),
    );
    const executablePath = await resolveBrowser(process.env.CHROME_PATH);

    steps.push(["renders", () => renderProblems(ROOT, names, { executablePath, out })]);
  }

  const checks = await runPostChecks(steps);
  const passed = checks.every((check) => check.passed);

  if (values.report) {
    await assertOwnedLocation(ROOT, values.report);
    await writeFile(values.report, `${JSON.stringify({ examples: names, checks, lint, passed }, null, 2)}\n`, {
      flag: "wx",
    });
  }

  for (const check of checks) {
    console.log(`${check.passed ? "passed" : "FAILED"} ${check.name}`);

    for (const problem of check.problems) {
      console.error(`  ${problem}`);
    }
  }

  if (!passed) {
    throw new Error(`Strict validation failed for ${names.length} example(s)`);
  }

  console.log(`${names.length} example(s) passed strict validation`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
