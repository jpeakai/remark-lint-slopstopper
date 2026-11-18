import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

// Real processes: a parent runs a child agent through runAgent and
// settleAgent, then prints "post-checks" only if they may run.
const repair = new URL("./repair.ts", import.meta.url).href;

async function scratch(t: { after: (fn: () => Promise<void>) => void }) {
  const root = new URL("../../tmp/", import.meta.url).pathname;

  await mkdir(root, { recursive: true });

  const dir = await mkdtemp(join(root, "agent-"));

  t.after(() => rm(dir, { recursive: true, force: true }));

  return dir;
}

async function parent(t: { after: (fn: () => Promise<void>) => void }, child: string) {
  const dir = await scratch(t);
  const childPath = join(dir, "child.mjs");
  const parentPath = join(dir, "parent.mjs");

  await writeFile(childPath, child);
  await writeFile(
    parentPath,
    `import { runAgent, settleAgent } from ${JSON.stringify(repair)};
const outcome = settleAgent(await runAgent(process.execPath, [${JSON.stringify(childPath)}], {
  cwd: ${JSON.stringify(dir)}, env: process.env, input: "prompt",
}));
if (outcome === "succeeded") console.log("post-checks");
if (outcome === "failed") console.log("failed only");
`,
  );

  return parentPath;
}

function run(path: string, interrupt: boolean) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }>((resolve) => {
    const process_ = spawn(process.execPath, [path], { stdio: ["ignore", "pipe", "inherit"] });
    let output = "";

    process_.stdout.on("data", (chunk: Buffer) => {
      output += String(chunk);

      if (interrupt && output.includes("ready")) {
        process_.kill("SIGINT");
      }
    });
    process_.on("exit", (code, signal) => resolve({ code, signal, output }));
  });
}

test("a parent cancellation wins when the child catches it and exits zero", async (t) => {
  const path = await parent(
    t,
    `process.on("SIGINT", () => process.exit(0));
console.log("ready");
setInterval(() => {}, 1000);
`,
  );

  const result = await run(path, true);

  assert.equal(result.signal, "SIGINT");
  assert.ok(!result.output.includes("post-checks"), result.output);
});

test("a successful child lets post-checks run, and a failing one keeps its code", async (t) => {
  const success = await run(
    await parent(t, "process.stdin.resume(); process.stdin.on('end', () => process.exit(0));\n"),
    false,
  );
  const failure = await run(await parent(t, "process.exit(3);\n"), false);

  assert.deepEqual([success.code, success.signal], [0, null]);
  assert.match(success.output, /post-checks/);
  assert.deepEqual([failure.code, failure.signal], [3, null]);
  assert.match(failure.output, /failed only/);
});

test("a child that cannot start rejects and leaves no signal listeners behind", async (t) => {
  const dir = await scratch(t);
  const { runAgent } = await import("./repair.ts");
  const before = process.listenerCount("SIGINT");

  await assert.rejects(runAgent(join(dir, "missing-agent"), [], { cwd: dir, env: process.env, input: "" }), /ENOENT/);
  assert.equal(process.listenerCount("SIGINT"), before);
});
