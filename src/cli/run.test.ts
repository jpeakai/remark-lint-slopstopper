import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { argumentsOf } from "./arguments.ts";
import { run } from "./run.ts";

const main = fileURLToPath(new URL("./main.ts", import.meta.url));
const plugin = new URL("../remark/plugin.ts", import.meta.url).href;

async function fixture(work: (cwd: string) => Promise<void>) {
  const cwd = await mkdtemp(join(tmpdir(), "slopstopper-cli-"));

  try {
    await work(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function check(cwd: string, argv: string[], input = "") {
  let output = "";
  let errors = "";
  const streamOut = new Writable({
    write(chunk, _encoding, done) {
      output += chunk;
      done();
    },
  });
  const streamError = new Writable({
    write(chunk, _encoding, done) {
      errors += chunk;
      done();
    },
  });

  const code = await run(argumentsOf(argv), cwd, {
    streamIn: Readable.from([input]),
    streamOut,
    streamError,
  });

  return { code, output, errors };
}

test("standalone engine handles mixed file, folder and glob inputs and JSON positions", {
  timeout: 30_000,
}, async () => {
  await fixture(async (cwd) => {
    await mkdir(join(cwd, "docs"));
    await writeFile(join(cwd, "docs/a.md"), "First sentence. Second sentence.\n");
    await writeFile(join(cwd, "docs/b.markdown"), "A clean sentence.\n");
    await writeFile(join(cwd, "extra.md"), "Another clean sentence.\n");

    const result = await check(cwd, ["--json", "docs", "extra*.md"]);
    const files = JSON.parse(result.output).files;

    assert.equal(result.code, 1);
    assert.equal(result.errors, "");
    assert.equal(files.length, 3);

    const message = files.find((file: { path: string }) => file.path.endsWith("a.md")).messages[0];

    assert.equal(message.ruleId, "sentence-one-per-line");
    assert.equal(message.line, 1);
    assert.equal(message.column, 16);
    assert.equal(message.fatal, true);
  });
});

test("fixes land despite remaining budget findings and a second run is stable", async () => {
  await fixture(async (cwd) => {
    const path = join(cwd, "input.md");
    const before =
      "# Kept heading\r\n\r\nFirst sentence. Second sentence has too many words for this budget.\r\n\r\n```text\r\nuntouched   bytes\r\n```\r\n";

    await writeFile(path, before);

    const argv = ["--fix", "--json", "--max-words", "5", "input.md"];

    const first = await check(cwd, argv);

    assert.equal(first.code, 1);

    const expected = before.replace("sentence. Second", "sentence.\r\nSecond");

    assert.equal(await readFile(path, "utf8"), expected);
    assert.equal(JSON.parse(first.output).files[0].fixes, 1);

    const second = await check(cwd, argv);

    assert.equal(second.code, 1);
    assert.equal(JSON.parse(second.output).files[0].fixes, 0);
    assert.equal(await readFile(path, "utf8"), expected);
  });
});

test("native config loads, CLI defaults override shared values and check mode never writes", async () => {
  await fixture(async (cwd) => {
    await writeFile(
      join(cwd, ".remarkrc.mjs"),
      `import plugin from ${JSON.stringify(plugin)}; export default {plugins:[[plugin,{fix:true,options:{maxWords:2}}]]};`,
    );

    const before = "The parser reads files. The reporter prints results.\n";
    const path = join(cwd, "input.md");

    await writeFile(path, before);

    const result = await check(cwd, ["--json", "--max-words", "25", "input.md"]);
    const messages = JSON.parse(result.output).files[0].messages;

    assert.deepEqual(
      messages.map((message: { ruleId: string }) => message.ruleId),
      ["sentence-one-per-line"],
    );
    assert.equal(await readFile(path, "utf8"), before);

    const fixed = await check(cwd, ["--fix", "--max-words", "25", "input.md"]);

    assert.equal(fixed.code, 0);
    assert.equal(await readFile(path, "utf8"), before.replace("files. The", "files.\nThe"));
  });
});

test("explicit config, config opt-out, ignore files and suppression stay native", async () => {
  await fixture(async (cwd) => {
    await writeFile(
      join(cwd, "custom.mjs"),
      `import plugin from ${JSON.stringify(plugin)}; export default {plugins:[[plugin,{rules:{"sentence-one-per-line":false}}]]};`,
    );
    await writeFile(join(cwd, "a.md"), "First sentence. Second sentence.\n");

    assert.equal((await check(cwd, ["--config", "custom.mjs", "a.md"])).code, 0);
    await writeFile(join(cwd, ".remarkrc.json"), "invalid config");

    assert.equal((await check(cwd, ["--no-config", "a.md"])).code, 1);
    await writeFile(join(cwd, ".remarkignore"), "ignored.md\n");
    await writeFile(join(cwd, "ignored.md"), "Wrong. Still wrong.\n");

    const result = await check(cwd, ["--no-config", "--json", "."]);

    assert.equal(JSON.parse(result.output).files.length, 1);

    const source = "<!--lint disable sentence-one-per-line-->\n\nFirst sentence. Second sentence.\n";

    await writeFile(join(cwd, "a.md"), source);

    assert.equal((await check(cwd, ["--no-config", "--fix", "a.md"])).code, 0);
    assert.equal(await readFile(join(cwd, "a.md"), "utf8"), source);
  });
});

test("stdin reports findings without echoing or writing source", async () => {
  await fixture(async (cwd) => {
    const result = await check(cwd, ["--json", "--stdin-filepath", "stdin.md"], "First sentence. Second sentence.\n");

    assert.equal(result.code, 1);

    const file = JSON.parse(result.output).files[0];

    assert.ok(file.path.endsWith("stdin.md"));
    assert.equal(file.messages[0].ruleId, "sentence-one-per-line");

    const clean = await check(cwd, [], "A clean sentence.\n");

    assert.equal(clean.code, 0);
    assert.equal(clean.output, "");
  });
});

test("Mermaid modes control actual evaluation and never rewrite diagrams", async () => {
  await fixture(async (cwd) => {
    const source = "```mermaid\nflowchart LR\n  A[unclosed\n```\n";
    const path = join(cwd, "diagram.md");

    await writeFile(path, source);

    assert.equal((await check(cwd, ["--prose-only", "diagram.md"])).code, 0);

    const result = await check(cwd, ["--mermaid-only", "--json", "--fix", "diagram.md"]);

    assert.equal(result.code, 1);

    const messages = JSON.parse(result.output).files[0].messages;

    assert.ok(
      messages.every(
        (message: { ruleId: string }) => message.ruleId.includes("contrast") || message.ruleId.includes("complexity"),
      ),
    );
    assert.equal(await readFile(path, "utf8"), source);
  });
});

test("a processing exception prevents persistence of otherwise verified edits", async () => {
  await fixture(async (cwd) => {
    const source = "First sentence. Second sentence.\n";
    const path = join(cwd, "input.md");

    await writeFile(path, source);
    await writeFile(
      join(cwd, ".remarkrc.mjs"),
      "export default {plugins:[function broken(){return ()=>{throw new Error('Cannot finish processing')}}]};",
    );

    const result = await check(cwd, ["--fix", "input.md"]);

    assert.equal(result.code, 2);
    assert.equal(await readFile(path, "utf8"), source);
  });
});

test("upstream recommended findings fail the command and invalid inputs return processing errors", async () => {
  await fixture(async (cwd) => {
    await writeFile(join(cwd, "input.md"), "A clean sentence.");

    const lint = await check(cwd, ["--json", "input.md"]);

    assert.equal(lint.code, 1);
    assert.equal(JSON.parse(lint.output).files[0].messages[0].ruleId, "final-newline");
    assert.equal((await check(cwd, ["missing.md"])).code, 2);
    await writeFile(join(cwd, ".remarkrc.json"), "invalid");

    assert.equal((await check(cwd, ["input.md"])).code, 2);
    assert.equal((await check(cwd, ["--ignore-path", "missing.ignore", "input.md"])).code, 2);
  });
});

test("source entry point exposes help, version, rule listing and invocation exit codes", () => {
  const invoke = (args: string[]) => spawnSync(process.execPath, [main, ...args], { encoding: "utf8" });
  const help = invoke(["--help"]);

  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: remark-lint-slopstopper/);
  assert.equal(invoke(["--version"]).status, 0);
  assert.match(invoke(["--list-rules"]).stdout, /mermaid\/contrast-text-below-aa/);

  const invalid = invoke(["--unknown"]);

  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Unknown option/);
});
