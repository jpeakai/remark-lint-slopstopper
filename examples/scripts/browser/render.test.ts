import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { type Manifest, pngDimensions, renderExamples, resolveBrowser, verifyRenderer } from "../render.ts";
import { repairExamples, verifyRepairRenders } from "../repair.ts";

// Real Chromium renders. Playwright's browser is used unless CHROME_PATH names one.
const executablePath = process.env.CHROME_PATH;
const browserOption = executablePath ? { executablePath } : {};

const VALID =
  '```mermaid\nflowchart LR\n  A[Order] --> B[Ship]\n```\n\n```mermaid\npie\n  "Kept": 3\n  "Returned": 1\n```\n';
const BROKEN = "```mermaid\nflowchart LR\n  A --> \n```\n";

async function scratchRoot(t: { after: (fn: () => Promise<void>) => void }, files: Record<string, string>) {
  const scratch = new URL("../../../tmp/", import.meta.url);

  await mkdir(scratch, { recursive: true });

  const root = await mkdtemp(join(scratch.pathname, "render-browser-"));

  t.after(() => rm(root, { recursive: true, force: true }));

  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, "examples", path, ".."), { recursive: true });
    await writeFile(join(root, "examples", path), content);
  }

  return root;
}

test("every fence renders to validated PNG and SVG files listed in the manifest", async (t) => {
  const root = await scratchRoot(t, { "01-valid/diagram-fixed.md": VALID });
  const out = join(root, "renders");

  const manifest = await renderExamples(root, { set: "comparison", out, ...browserOption });

  assert.deepEqual(manifest.failures, []);
  assert.equal(manifest.expected, 24);
  assert.equal(manifest.artifacts.length, 24);
  assert.deepEqual(
    manifest.files.map((file) => file.fences.map((fence) => fence.line)),
    [[1, 6]],
  );

  const onDisk = JSON.parse(await readFile(join(out, "comparison", "manifest.json"), "utf8")) as Manifest;

  assert.deepEqual(onDisk.artifacts, manifest.artifacts);

  for (const artifact of manifest.artifacts) {
    const path = join(out, "comparison", artifact.path);

    assert.equal((await stat(path)).size, artifact.bytes, artifact.id);
    assert.ok(artifact.width > 0 && artifact.height > 0, artifact.id);
  }

  const png = await readFile(join(out, "comparison", "01-valid", "fence-1--dark--black.png"));

  assert.ok(pngDimensions(png).width > 40);
});

test("a comparison that cannot render fails each of its scenarios by name", async (t) => {
  const root = await scratchRoot(t, { "01-broken/diagram-fixed.md": BROKEN });
  const out = join(root, "renders");

  const manifest = await renderExamples(root, { set: "comparison", out, ...browserOption });

  assert.equal(manifest.artifacts.length, 0);
  assert.equal(manifest.failures.length, 12);
  assert.ok(manifest.failures.some((failure) => failure.scenario === "01-broken#1/dark/transparent/svg"));
  assert.ok((await stat(join(out, "comparison", "manifest.json"))).isFile());
});

test("deliberately failing originals are recorded separately without failing", async (t) => {
  const root = await scratchRoot(t, { "01-broken/diagram.md": BROKEN, "01-broken/diagram-fixed.md": VALID });
  const out = join(root, "renders");

  const manifest = await renderExamples(root, { set: "original", out, ...browserOption });

  assert.deepEqual(manifest.failures, []);
  assert.equal(manifest.renderErrors.length, 6);
  assert.ok(manifest.renderErrors.every((error) => error.scenario.startsWith("01-broken#1/")));
  await assert.rejects(stat(join(out, "comparison")));
});

test("a file without Mermaid fences fails instead of passing with nothing to check", async (t) => {
  const root = await scratchRoot(t, { "01-empty/diagram-fixed.md": "# No diagram here\n" });

  const manifest = await renderExamples(root, { set: "comparison", out: join(root, "renders"), ...browserOption });

  assert.deepEqual(
    manifest.failures.map((failure) => failure.reason),
    ["examples/01-empty/diagram-fixed.md has no Mermaid fences"],
  );
});

test("the preflight resolves a real browser and renders a test diagram", async () => {
  const browser = await resolveBrowser(executablePath);

  const dimensions = await verifyRenderer(browser);

  assert.ok(dimensions.width > 0 && dimensions.height > 0);
});

test("a repair passes the browser preflight before failing on its own login", async (t) => {
  const root = await scratchRoot(t, { "01-valid/diagram.md": VALID, "01-valid/diagram-fixed.md": "reviewed" });

  await writeFile(join(root, "examples", "fix-prompt.md"), "Repair the diagrams.");

  await assert.rejects(
    repairExamples(root, {
      ...(executablePath ? { browser: executablePath } : {}),
      authFile: join(root, "missing-auth.json"),
      skills: [],
      codexArgs: [],
    }),
    /ENOENT.*missing-auth\.json/,
  );
  assert.equal(await readFile(join(root, "examples", "01-valid", "diagram-fixed.md"), "utf8"), "reviewed");
});

test("verified repair renders write a manifest and fail on a comparison that cannot render", async (t) => {
  const root = await scratchRoot(t, {
    "01-valid/diagram-fixed.md": VALID,
    "02-broken/diagram-fixed.md": BROKEN,
    "03-unselected/diagram-fixed.md": VALID,
  });
  const out = join(root, "renders");
  const render = { executablePath: await resolveBrowser(executablePath), out, matrix: "matched" as const };

  await verifyRepairRenders(root, ["01-valid"], render);

  const manifest = JSON.parse(await readFile(join(out, "comparison", "manifest.json"), "utf8")) as Manifest;

  assert.equal(manifest.matrix, "matched");
  assert.equal(manifest.artifacts.length, 8);
  await assert.rejects(stat(join(out, "comparison", "03-unselected")));
  await assert.rejects(
    verifyRepairRenders(root, ["02-broken"], render),
    /failed render verification:\n02-broken#1\/light\/white\/png: /,
  );
});
