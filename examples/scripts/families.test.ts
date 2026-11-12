import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { guardExample, guardExamples, loadTranslations, normalFamily } from "./families.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const translations = loadTranslations(await readFile(join(root, "examples", "translations.yml"), "utf8"));
const named = async (prefix: string) =>
  (await readdir(join(root, "examples"))).find((name) => name.startsWith(prefix)) ?? prefix;

async function scratch(t: { after: (fn: () => Promise<void>) => void }) {
  await mkdir(join(root, "tmp"), { recursive: true });

  const dir = await mkdtemp(join(root, "tmp", "families-"));

  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "examples"), { recursive: true });

  return dir;
}

// A copy of a real example whose comparison is edited by `change`.
async function tampered(
  t: { after: (fn: () => Promise<void>) => void },
  prefix: string,
  change: (text: string) => string,
) {
  const dir = await scratch(t);
  const example = await named(prefix);

  await cp(join(root, "examples", example), join(dir, "examples", example), { recursive: true });

  const path = join(dir, "examples", example, "diagram-fixed.md");
  const before = await readFile(path, "utf8");
  const after = change(before);

  assert.notEqual(after, before, "the tamper must change the comparison");
  await writeFile(path, after);

  return guardExample(dir, example, translations[example]);
}

test("every example keeps its family or makes an approved, fact-preserving translation", async () => {
  const examples = (await readdir(join(root, "examples"))).filter((name) => /^\d{2,}-/.test(name)).sort();

  assert.deepEqual(await guardExamples(root, examples), []);
});

test("equivalent flowchart, class and state detectors share a family, but ELK stays distinct", () => {
  assert.deepEqual(
    ["graph", "flowchart", "flowchart-v2", "class", "classDiagram-v2", "stateDiagram-v2", "flowchart-elk"].map(
      normalFamily,
    ),
    ["flowchart", "flowchart", "flowchart", "classDiagram", "classDiagram", "stateDiagram", "flowchart-elk"],
  );
});

test("an unapproved family change and a missing diagram are rejected by file", async (t) => {
  const dir = await scratch(t);

  await mkdir(join(dir, "examples", "01-a"));
  await writeFile(join(dir, "examples", "01-a", "diagram.md"), "```mermaid\nflowchart LR\n  A --> B\n```\n");
  await writeFile(join(dir, "examples", "01-a", "diagram-fixed.md"), '```mermaid\npie\n  "A": 1\n```\n');
  await mkdir(join(dir, "examples", "02-b"));
  await writeFile(join(dir, "examples", "02-b", "diagram.md"), "```mermaid\nflowchart LR\n  A --> B\n```\n");
  await writeFile(join(dir, "examples", "02-b", "diagram-fixed.md"), "# The diagram went missing\n");

  assert.deepEqual(await guardExample(dir, "01-a"), [
    "examples/01-a/diagram-fixed.md: pie replaces the original flowchart without an approved translation",
  ]);
  assert.deepEqual(await guardExample(dir, "02-b"), ["examples/02-b/diagram-fixed.md: has no Mermaid diagram"]);
});

test("a translated example without its mapping is a family change", async () => {
  const example = await named("15-");

  assert.match((await guardExample(root, example)).join("\n"), /flowchart replaces the original c4/);
});

test("each approved translation must keep its facts", async (t) => {
  const sankey = await tampered(t, "24-", (text) => text.replace("|870|", "|871|"));
  const timeline = await tampered(t, "26-", (text) => text.replace("Jan --> Contract", "Jan --> Tracing"));
  const c4 = await tampered(t, "15-", (text) => text.replace("Books shipment", "Ships"));
  const tree = await tampered(t, "28-", (text) => text.replace("orders.ts", "order.ts"));

  assert.match(sankey.join("\n"), /Flows and volumes differ/);
  assert.match(timeline.join("\n"), /Chronology and event order differ/);
  assert.match(c4.join("\n"), /Relationships differ/);
  assert.match(tree.join("\n"), /Hierarchy edges differ/);
});

test("a mapping needs a reason and a translation with a fact check", () => {
  assert.throws(() => loadTranslations("01-a:\n  from: pie\n  to: flowchart\n  reason: x\n"), /has no fact check/);
  assert.throws(() => loadTranslations("01-a:\n  from: c4\n  to: flowchart\n"), /needs from, to and a reason/);
});
