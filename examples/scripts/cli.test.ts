import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { parseOptions } from "./cli.ts";
import { failureExitCode, repairExamples } from "./repair.ts";

test("the example selector and installed skill path reach the runner separately", () => {
  const options = parseOptions(["03-flowchart", "--skill", "./plugin/mermaidjs-diagrams", "--model", "chosen-model"]);

  assert.deepEqual(options, {
    example: "03-flowchart",
    skills: ["./plugin/mermaidjs-diagrams"],
    codexArgs: ["--model", "chosen-model"],
  });
});

test("arguments after the separator remain literal Codex arguments", () => {
  const options = parseOptions(["--skill", "./skill", "--", "--skill", "$(literal); value"]);

  assert.deepEqual(options.skills, ["./skill"]);
  assert.deepEqual(options.codexArgs, ["--skill", "$(literal); value"]);
});

test("path options reject missing values before a repair starts", () => {
  for (const flag of ["--skill", "--auth-file", "--codex-home"]) {
    assert.throws(() => parseOptions([flag]), /Expected a path/);
    assert.throws(() => parseOptions([flag, "--model"]), /Expected a path/);
  }
});

test("an invalid selector leaves real comparison files untouched", async (t) => {
  const scratch = new URL("../../tmp/", import.meta.url);

  await mkdir(scratch, { recursive: true });

  const root = await mkdtemp(join(scratch.pathname, "example-selection-"));

  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "examples", "01-flowchart"), { recursive: true });
  await writeFile(join(root, "examples", "01-flowchart", "diagram.md"), "original");
  await writeFile(join(root, "examples", "01-flowchart", "diagram-fixed.md"), "reviewed comparison");

  for (const example of ["../01-flowchart", "missing", ".", ".."]) {
    await assert.rejects(
      repairExamples(root, { example, skills: [], codexArgs: [] }),
      /Expected an example|Unknown example/,
    );
  }

  assert.equal(
    await readFile(join(root, "examples", "01-flowchart", "diagram-fixed.md"), "utf8"),
    "reviewed comparison",
  );
});

test("the browser option reaches the runner as a path", () => {
  assert.equal(parseOptions(["--browser", "/opt/chrome"]).browser, "/opt/chrome");
  assert.throws(() => parseOptions(["--browser"]), /Expected a path/);
});

test("an unavailable explicit browser stops the run before any reset or login copy", async (t) => {
  const scratch = new URL("../../tmp/", import.meta.url);

  await mkdir(scratch, { recursive: true });

  const root = await mkdtemp(join(scratch.pathname, "browser-preflight-"));

  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "examples", "01-flowchart"), { recursive: true });
  await writeFile(join(root, "examples", "fix-prompt.md"), "Repair the diagrams.");
  await writeFile(join(root, "examples", "01-flowchart", "diagram.md"), "original");
  await writeFile(join(root, "examples", "01-flowchart", "diagram-fixed.md"), "reviewed comparison");

  await assert.rejects(
    repairExamples(root, { browser: join(root, "no-such-chrome"), skills: [], codexArgs: [] }),
    /Browser executable not found or not executable: .*no-such-chrome.*No fixed diagrams were reset/,
  );
  assert.equal(
    await readFile(join(root, "examples", "01-flowchart", "diagram-fixed.md"), "utf8"),
    "reviewed comparison",
  );
  await assert.rejects(readFile(join(root, "tmp", "codex-runs")), /ENOENT/);
});

test("the render option selects the full or matched matrix", () => {
  assert.equal(parseOptions(["--render", "matched"]).render, "matched");
  assert.equal(parseOptions(["--render", "full"]).render, "full");
  assert.throws(() => parseOptions(["--render", "fast"]), /Expected full or matched/);
});

test("a failed later check keeps the agent's own nonzero exit status", () => {
  assert.equal(failureExitCode(3), 3);
  assert.equal(failureExitCode(0), 1);
  assert.equal(failureExitCode(undefined), 1);
  assert.equal(failureExitCode(null), 1);
});
