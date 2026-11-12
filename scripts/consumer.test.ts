import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

// Source tests and a clean build do not prove the published archive works, so
// this packs the package, installs the archive into an empty project without
// install scripts, and uses only what the archive ships.

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGE = "@jpeakai/remark-lint-slopstopper";
const EXPORTS = ["", "/remark", "/document", "/language-view"];

// Paths that must never ship: tests, scratch output and repository tooling.
const FORBIDDEN = [
  /\.test\.[cm]?[jt]s$/,
  /^tmp\//,
  /^examples\//,
  /^docs-site\//,
  /^docs\//,
  /^config\//,
  /^adrs\//,
  /^scripts\//,
  /^\.github\//,
  /^node_modules\//,
  /^(biome\.json|eslint\.config\.mjs|bunfig\.toml|Makefile|pyproject\.toml|uv\.lock|bun\.lock)$/,
];

let work = "";
let consumer = "";
let archive = "";
let shipped: string[] = [];

function run(command: string, args: string[], cwd: string, input?: string) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", input, env: { ...process.env, NO_COLOR: "1" } });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function succeed(command: string, args: string[], cwd: string) {
  const result = run(command, args, cwd);

  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);

  return result.stdout;
}

// Run a module in the consumer with Node, as an installed user would.
function node(source: string) {
  return run(process.execPath, ["--input-type=module", "-e", source], consumer);
}

before(async () => {
  await mkdir(join(ROOT, "tmp"), { recursive: true });
  work = await mkdtemp(join(ROOT, "tmp", "consumer-"));
  consumer = join(work, "project");

  succeed("bun", ["run", "build"], ROOT);
  archive = succeed("bun", ["pm", "pack", "--ignore-scripts", "--quiet", "--destination", work], ROOT)
    .trim()
    .split("\n")
    .at(-1) as string;
  archive = archive.startsWith("/") ? archive : join(work, archive);
  shipped = succeed("tar", ["-tzf", archive], work)
    .split("\n")
    .filter(Boolean)
    .map((path) => path.replace(/^package\//, ""));

  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    `${JSON.stringify({ name: "consumer", private: true, type: "module" })}\n`,
  );
  succeed("bun", ["add", "--production", "--ignore-scripts", archive], consumer);
});

after(() => {
  console.log(`consumer project: ${consumer}`);
});

test("the archive ships no tests, scratch output or repository tooling", () => {
  assert.deepEqual(
    shipped.filter((path) => FORBIDDEN.some((pattern) => pattern.test(path))),
    [],
  );

  for (const required of ["package.json", "README.md", "RULES.md", "LICENSE", "dist/cli.js", "dist/types/index.d.ts"]) {
    assert.ok(shipped.includes(required), `${required} is missing from the archive`);
  }
});

// Every shipped dist module must be reachable from an export or the binary;
// anything else is a stale chunk from an earlier local build.
test("every shipped dist module is reachable from an entry point", async () => {
  const manifest = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8")) as {
    exports: Record<string, { default: string }>;
    bin: Record<string, string>;
  };
  const entries = [...Object.values(manifest.exports).map((entry) => entry.default), ...Object.values(manifest.bin)];
  const reached = new Set<string>();
  const pending = entries.map((entry) => posix.normalize(entry));

  while (pending.length) {
    const path = pending.pop() as string;

    if (reached.has(path)) {
      continue;
    }

    reached.add(path);

    const text = await readFile(join(ROOT, path), "utf8");

    for (const [, specifier] of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      pending.push(posix.join(posix.dirname(path), specifier as string));
    }
  }

  const stale = shipped.filter((path) => path.startsWith("dist/") && path.endsWith(".js") && !reached.has(path));

  assert.deepEqual(stale, [], "stale build chunks: remove dist/ and run bun run build");
});

test("Node imports every documented export from the installed archive", () => {
  const result = node(`
    const names = {};
    for (const entry of ${JSON.stringify(EXPORTS)}) {
      const module = await import(${JSON.stringify(PACKAGE)} + entry);
      names[entry || "."] = Object.keys(module).sort();
    }
    console.log(JSON.stringify(names));
  `);

  assert.equal(result.status, 0, result.stderr);

  const names = JSON.parse(result.stdout) as Record<string, string[]>;

  assert.ok(names["."]?.includes("default"));
  assert.ok(names["/remark"]?.includes("default"));
  assert.ok(names["/document"]?.includes("createDocument"));
  assert.ok((names["/language-view"]?.length ?? 0) > 0);
});

test("the installed plugin fixes prose and reports Mermaid contrast", () => {
  const result = node(`
    import remarkParse from "remark-parse";
    import remarkStringify from "remark-stringify";
    import { unified } from "unified";
    import { VFile } from "vfile";
    import slopstopper from ${JSON.stringify(`${PACKAGE}/remark`)};
    const prose = new VFile("First sentence. Second sentence.\\n");
    await unified().use(remarkParse).use(remarkStringify).use(slopstopper, { fix: true }).process(prose);
    const diagram = new VFile("\`\`\`mermaid\\nflowchart LR\\n  A\\n  style A fill:#fff,color:#fff\\n\`\`\`\\n");
    const processor = unified().use(remarkParse).use(slopstopper);
    await processor.run(processor.parse(diagram), diagram);
    console.log(JSON.stringify({ fixed: String(prose), rules: diagram.messages.map((m) => m.ruleId) }));
  `);

  assert.equal(result.status, 0, result.stderr);

  const { fixed, rules } = JSON.parse(result.stdout) as { fixed: string; rules: string[] };

  assert.equal(fixed, "First sentence.\nSecond sentence.\n");
  assert.ok(rules.includes("contrast-text-below-aa"), JSON.stringify(rules));
});

test("the installed CLI checks, fixes and then passes a file", async () => {
  const cli = join(consumer, "node_modules", PACKAGE, "dist", "cli.js");
  const file = join(consumer, "notes.md");

  await writeFile(file, "First sentence. Second sentence.\n");

  const check = run(process.execPath, [cli, "notes.md"], consumer);
  const fix = run(process.execPath, [cli, "--fix", "notes.md"], consumer);
  const recheck = run(process.execPath, [cli, "notes.md"], consumer);

  assert.equal(check.status, 1, check.stderr);
  assert.match(check.stdout + check.stderr, /sentence-one-per-line/);
  assert.equal(fix.status, 0, fix.stdout + fix.stderr);
  assert.equal(await readFile(file, "utf8"), "First sentence.\nSecond sentence.\n");
  assert.equal(recheck.status, 0, recheck.stdout + recheck.stderr);
});

test("a TypeScript consumer compiles against the emitted declarations", async () => {
  await writeFile(
    join(consumer, "consumer.ts"),
    `import recommended from "${PACKAGE}";
import slopstopper, { type RemarkSlopstopperOptions } from "${PACKAGE}/remark";
import { createDocument } from "${PACKAGE}/document";

const options: RemarkSlopstopperOptions = { fix: false, rules: { "sentence-one-per-line": false } };
const document = createDocument("One sentence.");
const count: number = document.paragraphs.length;

export { count, options, recommended, slopstopper };
`,
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    `${JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "es2023",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      },
      files: ["consumer.ts"],
    })}\n`,
  );

  const tsc = join(ROOT, "node_modules", "typescript", "bin", "tsc");
  const result = run(process.execPath, [tsc, "--project", join(consumer, "tsconfig.json")], dirname(consumer));

  assert.equal(result.status, 0, result.stdout + result.stderr);
});
