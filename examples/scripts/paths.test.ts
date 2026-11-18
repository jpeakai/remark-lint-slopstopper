import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { assertOwnedLocation, canonicalExample, ownedOutput } from "./paths.ts";
import { renderExamples } from "./render.ts";
import { repairExamples } from "./repair.ts";

// Real temporary filesystems: a project root with examples/ and tmp/, and an
// outside directory that links try to reach.
async function project(t: { after: (fn: () => Promise<void>) => void }) {
  const scratch = new URL("../../tmp/", import.meta.url).pathname;

  await mkdir(scratch, { recursive: true });

  const base = await mkdtemp(join(scratch, "paths-"));
  const root = join(base, "project");
  const outside = join(base, "outside");

  t.after(() => rm(base, { recursive: true, force: true }));
  await mkdir(join(root, "examples", "01-real"), { recursive: true });
  await mkdir(join(root, "tmp"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(root, "examples", "fix-prompt.md"), "Repair the diagrams.");
  await writeFile(join(root, "examples", "01-real", "diagram.md"), "```mermaid\nflowchart LR\n  A --> B\n```\n");
  await writeFile(join(root, "examples", "01-real", "diagram-fixed.md"), "reviewed comparison");
  await writeFile(join(outside, "secret.md"), "outside");

  return { root, outside };
}

test("a real example is accepted and its canonical folder returned", async (t) => {
  const { root } = await project(t);

  assert.match(await canonicalExample(root, "01-real"), /examples\/01-real$/);
});

test("a linked example folder or file is rejected", async (t) => {
  const { root, outside } = await project(t);

  await symlink(outside, join(root, "examples", "02-linked"));
  await mkdir(join(root, "examples", "03-file"));
  await symlink(join(outside, "secret.md"), join(root, "examples", "03-file", "diagram-fixed.md"));

  await assert.rejects(canonicalExample(root, "02-linked"), /Example 02-linked is a filesystem link/);
  await assert.rejects(canonicalExample(root, "03-file"), /03-file\/diagram-fixed.md is a filesystem link/);
  await assert.rejects(canonicalExample(root, "../outside"), /Expected an example folder name/);
});

test("output must be a new directory inside tmp/ reached without links", async (t) => {
  const { root, outside } = await project(t);

  await symlink(outside, join(root, "tmp", "linked"));
  await mkdir(join(root, "tmp", "taken"));

  await assert.rejects(ownedOutput(root, join(outside, "run")), /must be inside the project's tmp\//);
  await assert.rejects(
    ownedOutput(root, join(root, "tmp", "linked", "run")),
    /Output path component is a filesystem link/,
  );
  await assert.rejects(ownedOutput(root, join(root, "tmp", "taken")), /Output already exists/);
  await assert.rejects(assertOwnedLocation(root, join(root, "tmp", "linked", "run")), /filesystem link/);

  const fresh = await ownedOutput(root, join(root, "tmp", "runs", "first"));

  assert.ok((await stat(fresh)).isDirectory());
  await assert.rejects(stat(join(outside, "run")));
});

test("paths are checked before a browser is launched", async (t) => {
  const { root, outside } = await project(t);
  const missingBrowser = join(root, "no-such-browser");

  await symlink(outside, join(root, "examples", "02-linked"));
  await mkdir(join(root, "tmp", "taken", "comparison"), { recursive: true });

  await assert.rejects(
    renderExamples(root, {
      set: "comparison",
      examples: ["02-linked"],
      out: join(root, "tmp", "a"),
      executablePath: missingBrowser,
    }),
    /filesystem link/,
  );
  await assert.rejects(
    renderExamples(root, {
      set: "comparison",
      examples: ["01-real"],
      out: join(root, "tmp", "taken"),
      executablePath: missingBrowser,
    }),
    /Output already exists/,
  );
});

test("a repair rejects linked examples and foreign run directories before any reset", async (t) => {
  const { root, outside } = await project(t);
  const missingBrowser = join(root, "no-such-browser");

  await symlink(outside, join(root, "examples", "02-linked"));

  await assert.rejects(
    repairExamples(root, { example: "02-linked", browser: missingBrowser, skills: [], codexArgs: [] }),
    /filesystem link/,
  );
  await assert.rejects(
    repairExamples(root, {
      example: "01-real",
      browser: missingBrowser,
      codexHome: join(outside, "home"),
      skills: [],
      codexArgs: [],
    }),
    /must be inside the project's tmp\//,
  );
  assert.equal(await readFile(join(root, "examples", "01-real", "diagram-fixed.md"), "utf8"), "reviewed comparison");
});
