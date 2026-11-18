import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { repairReport, runPostChecks, snapshotUnselected, writeReport } from "./postchecks.ts";
import { renderProblems, runAgent } from "./repair.ts";
import { strictLint } from "./strict.ts";

// Real files and real processes: scratch copies of two examples, an Agent
// that is a real child process, and renders that fail for want of a browser.

const REAL = fileURLToPath(new URL("../", import.meta.url));
const TMP = fileURLToPath(new URL("../../tmp/", import.meta.url));
const FLOW = "03-flowchart--unreadable-label--text-against-node-fills";
const SEQUENCE = "07-sequenceDiagram--checkout-authorization-sequence--sequence-participants-messages";
const DASHED = "\nOrders move fast — mostly.\n";

type Context = { after: (fn: () => Promise<void>) => void };

async function scratchRoot(t: Context): Promise<string> {
  await mkdir(TMP, { recursive: true });

  const root = await mkdtemp(join(TMP, "postchecks-"));

  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "tmp"), { recursive: true });
  await cp(join(REAL, "translations.yml"), join(root, "examples", "translations.yml"));

  for (const name of [FLOW, SEQUENCE]) {
    await cp(join(REAL, name), join(root, "examples", name), { recursive: true });
  }

  return root;
}

const fixed = (root: string, name: string) => join(root, "examples", name, "diagram-fixed.md");
const noBrowser = (root: string) => () =>
  renderProblems(root, [FLOW], { executablePath: join(root, "no-browser"), out: join(root, "tmp", "renders") });

test("strict lint passes clean comparisons and reports each file and the combined document", async (t) => {
  const root = await scratchRoot(t);

  assert.deepEqual(await strictLint(root, [FLOW, SEQUENCE]), { passed: true, diagnostics: [] });

  await appendFile(fixed(root, SEQUENCE), DASHED);

  const { passed, diagnostics } = await strictLint(root, [FLOW, SEQUENCE]);

  assert.equal(passed, false);
  assert.deepEqual([...new Set(diagnostics.map((d) => d.example))], [SEQUENCE, "combined"]);
  assert.ok(
    diagnostics.every((d) => d.line !== undefined && d.rule.includes("/")),
    JSON.stringify(diagnostics),
  );
});

test("strict lint refuses message-control comments that would silence a policy", async (t) => {
  const root = await scratchRoot(t);

  await appendFile(fixed(root, FLOW), "\n<!-- lint disable -->\n");

  const { diagnostics } = await strictLint(root, [FLOW]);

  assert.deepEqual(
    diagnostics.map((d) => d.rule),
    ["strict/message-control"],
  );
});

test("every post-check runs and reports when several fail at once", async (t) => {
  const root = await scratchRoot(t);
  const before = await snapshotUnselected(root, [FLOW]);

  await writeFile(fixed(root, FLOW), `# Flow\n${DASHED}\n\`\`\`mermaid\npie\n  "A": 1\n\`\`\`\n`);
  await appendFile(fixed(root, SEQUENCE), "\nChanged.\n");

  const report = await repairReport({
    root,
    names: [FLOW],
    agent: { code: 0, signal: null, cancelled: null },
    before,
    renders: noBrowser(root),
  });

  assert.deepEqual(
    report.checks.map((check) => [check.name, check.passed]),
    [
      ["family", false],
      ["lint", false],
      ["renders", false],
      ["scope", false],
    ],
  );
  assert.ok(report.lint.length > 0);
  assert.deepEqual(report.checks.find((check) => check.name === "scope")?.problems, [
    `unselected example ${SEQUENCE} changed`,
  ]);
  assert.equal(report.passed, false);
});

test("a thrown step is that step's failure and later steps still run", async () => {
  const checks = await runPostChecks([
    [
      "family",
      async () => {
        throw new Error("boom");
      },
    ],
    ["lint", async () => []],
  ]);

  assert.deepEqual(checks, [
    { name: "family", passed: false, problems: ["boom"] },
    { name: "lint", passed: true, problems: [] },
  ]);
});

test("the report keeps a nonzero Agent exit and refuses to overwrite or leave tmp/", async (t) => {
  const root = await scratchRoot(t);
  const before = await snapshotUnselected(root, [FLOW]);
  const child = join(root, "tmp", "agent.mjs");

  await writeFile(child, "process.stdin.resume(); process.stdin.on('end', () => process.exit(3));\n");

  const agent = await runAgent(process.execPath, [child], { cwd: root, env: process.env, input: "prompt" });
  const report = await repairReport({ root, names: [FLOW], agent, before, renders: noBrowser(root) });
  const path = join(root, "tmp", "report.json");

  await writeReport(root, path, report);

  const saved = JSON.parse(await readFile(path, "utf8"));

  assert.deepEqual(saved.agent, { code: 3, signal: null, cancelled: null });
  assert.equal(saved.passed, false);
  assert.deepEqual(
    saved.checks.map((check: { name: string; passed: boolean }) => [check.name, check.passed]),
    [
      ["family", true],
      ["lint", true],
      ["renders", false],
      ["scope", true],
    ],
  );
  await assert.rejects(writeReport(root, path, report), /EEXIST/);
  await assert.rejects(writeReport(root, join(root, "report.json"), report), /inside the project's tmp/);
});

test("a repair runner exits with the Agent's own code when post-checks also fail", async (t) => {
  const root = await scratchRoot(t);
  const runner = join(root, "tmp", "runner.mjs");
  const modules = new URL("./", import.meta.url).href;

  await writeFile(join(root, "tmp", "agent.mjs"), "process.exit(4);\n");
  await writeFile(
    runner,
    `import { join } from "node:path";
import { repairReport, reportFailure, snapshotUnselected } from ${JSON.stringify(`${modules}postchecks.ts`)};
import { failureExitCode, renderProblems, runAgent, settleAgent } from ${JSON.stringify(`${modules}repair.ts`)};
const root = ${JSON.stringify(root)};
const names = [${JSON.stringify(FLOW)}];
try {
  const before = await snapshotUnselected(root, names);
  const agent = await runAgent(process.execPath, [join(root, "tmp", "agent.mjs")], { cwd: root, env: process.env, input: "" });
  settleAgent(agent);
  const report = await repairReport({ root, names, agent, before,
    renders: () => renderProblems(root, names, { executablePath: join(root, "no-browser"), out: join(root, "tmp", "r") }) });
  const failure = reportFailure(report);
  if (failure) throw new Error(failure);
} catch (error) {
  console.error(error.message);
  process.exitCode = failureExitCode(process.exitCode);
}
`,
  );

  const code = await new Promise<number | null>((resolve) => {
    spawn(process.execPath, [runner], { stdio: "ignore" }).on("exit", (exit) => resolve(exit));
  });

  assert.equal(code, 4);
});
