#!/usr/bin/env node
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { renderExamples } from "./render.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const HELP = `Usage: bun run render:examples [example ...] [--originals] [--out DIR]

Render each Mermaid fence in the light and dark themes, on white, black and
transparent backgrounds, as PNG and SVG. Every artifact is re-read and
validated, and a manifest.json records sources, scenarios, paths and sizes.

Options:
  --originals  Render diagram.md originals instead of diagram-fixed.md
               comparisons. Their render errors are recorded, not fatal.
  --out DIR    Output directory (default: tmp/renders)
  -h, --help   Show this help and exit

The browser is Playwright's Chromium, or the executable in CHROME_PATH.`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      originals: { type: "boolean", default: false },
      out: { type: "string", default: join(ROOT, "tmp", "renders") },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) {
    console.log(HELP);

    return;
  }

  const executablePath = process.env.CHROME_PATH;
  const manifest = await renderExamples(ROOT, {
    set: values.originals ? "original" : "comparison",
    examples: positionals,
    out: values.out,
    ...(executablePath ? { executablePath } : {}),
  });
  const where = join(values.out, manifest.set, "manifest.json");

  for (const error of manifest.renderErrors) {
    console.error(`render error (recorded): ${error.scenario}: ${error.reason}`);
  }

  if (manifest.failures.length) {
    for (const failure of manifest.failures) {
      console.error(`FAIL ${failure.scenario}: ${failure.reason}`);
    }

    throw new Error(`${manifest.failures.length} scenario failures; see ${where}`);
  }

  console.log(`${manifest.artifacts.length} artifacts verified; manifest ${where}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
