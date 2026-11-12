#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { analyzeMermaid } from "../../src/mermaid/analyze.ts";
import { MERMAID_RULES } from "../../src/rules.ts";
import { type AcceptanceRecord, acceptExample } from "./acceptance.ts";
import { loadBudgets } from "./budgets.ts";
import { loadTranslations } from "./families.ts";
import { exampleNames, renderExamples, resolveBrowser } from "./render.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const HELP = `Usage: bun run accept:examples [example ...] [--site DIR] [--out DIR]

Accept each diagram comparison on its own evidence: family guard and facts,
every package policy within its finding budget, verified renders across the
full matrix, and its site page and source downloads. A combined document of
the selected comparisons must report what each reports alone.

Options:
  --site DIR  Built documentation site (default: tmp/site; run make site first)
  --out DIR   Where acceptance records and renders go (default: tmp/acceptance)
  -h, --help  Show this help and exit`;

// The selected comparisons as one document must report what each reports alone.
async function combinedProblems(names: readonly string[]): Promise<string[]> {
  const sources = await Promise.all(
    names.map((name) => readFile(join(ROOT, "examples", name, "diagram-fixed.md"), "utf8")),
  );
  const combined = sources.join("\n\n");
  const together = await analyzeMermaid(combined, { rules: MERMAID_RULES });
  const problems: string[] = [];
  let start = 0;

  for (const [index, name] of names.entries()) {
    const source = sources[index] ?? "";
    const end = start + source.length + 2;
    const alone = (await analyzeMermaid(source, { rules: MERMAID_RULES })).map((f) => [f.message, f.start, f.end]);
    const mine = together
      .filter((finding) => finding.start >= start && finding.start < end)
      .map((finding) => [finding.message, finding.start - start, finding.end - start]);

    if (JSON.stringify(mine) !== JSON.stringify(alone)) {
      problems.push(`${name}: combined-document findings differ from its own`);
    }

    start = end;
  }

  return problems;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      site: { type: "string", default: join(ROOT, "tmp", "site") },
      out: { type: "string", default: join(ROOT, "tmp", "acceptance") },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    console.log(HELP);

    return;
  }

  if (!(await stat(join(values.site, "index.html")).catch(() => null))?.isFile()) {
    throw new Error(`No built site at ${values.site}. Run make site first, or pass --site DIR.`);
  }

  const names = await exampleNames(ROOT, positionals);
  const renders = await renderExamples(ROOT, {
    set: "comparison",
    examples: names,
    out: join(values.out, "renders"),
    executablePath: await resolveBrowser(process.env.CHROME_PATH),
  });
  const context = {
    budgets: loadBudgets(await readFile(join(ROOT, "examples", "finding-budgets.yml"), "utf8")),
    translations: loadTranslations(await readFile(join(ROOT, "examples", "translations.yml"), "utf8")),
    renders,
    site: values.site,
  };
  const records: AcceptanceRecord[] = [];

  await mkdir(values.out, { recursive: true });

  for (const name of names) {
    const record = await acceptExample(ROOT, name, context);

    records.push(record);
    await writeFile(join(values.out, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`${record.accepted ? "accepted" : "REJECTED"} ${name}`);

    for (const failed of record.checks.filter((item) => !item.passed)) {
      console.error(`  ${failed.name}: ${failed.problems.join("; ")}`);
    }
  }

  const combined = await combinedProblems(names);

  await writeFile(
    join(values.out, "acceptance.json"),
    `${JSON.stringify({ accepted: records.filter((r) => r.accepted).length, examples: records.length, combined }, null, 2)}\n`,
  );

  for (const problem of combined) {
    console.error(problem);
  }

  if (combined.length || records.some((record) => !record.accepted)) {
    throw new Error(`Some comparisons were not accepted; see ${values.out}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
