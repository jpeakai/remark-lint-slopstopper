import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { CynefinDB } from "mermaid/dist/diagrams/cynefin/types.js";
import type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";
import type { TreeViewDB } from "mermaid/dist/diagrams/treeView/types.js";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { VFile } from "vfile";
import { createDocument } from "../document/context.ts";
import remarkSlopstopper from "../remark/plugin.ts";
import { analyzeMermaid, MERMAID_RULES } from "./analyze.ts";
import { calculateComplexity, thresholdsFrom } from "./complexity/metrics.ts";
import { fences } from "./markdown.ts";
import { getMermaidCore } from "./parsing/engine.ts";
import { extractGraph } from "./parsing/graph.ts";
import { extractStats } from "./parsing/statistics.ts";
import { type SplitPlan, splitOutcome } from "./splitting/index.ts";

const read = (name: string) =>
  readFileSync(new URL(`../../examples/${name}`, import.meta.url), "utf8");
const initial = read("multiple-diagrams.md");
const improved = read("multiple-diagrams-fixed.md");
const before = fences(createDocument(initial));
const after = fences(createDocument(improved));
function sections(source: string): Map<string, string[]> {
  const document = createDocument(source);
  const nodes = document.tree.children;
  const result = new Map<string, string[]>();
  for (const [index, node] of nodes.entries()) {
    if (node.type !== "heading") continue;
    const title = node.children
      .map((n) => ("value" in n ? n.value : ""))
      .join("");
    const end = nodes
      .slice(index + 1)
      .find((n) => n.type === "heading" && n.depth <= node.depth);
    const start = node.position?.end.offset ?? 0;
    const stop = end?.position?.start.offset ?? source.length;
    result.set(
      title,
      fences(document)
        .filter((f) => f.start > start && f.start < stop)
        .map((f) => f.value),
    );
  }
  return result;
}
const originals = sections(initial);
const revisions = sections(improved);
function views(collection: Map<string, string[]>, title: string): string[] {
  const found = collection.get(title);
  assert.ok(found?.length, title);
  return found;
}
const headings: Record<string, string> = {
  shop: "Shop architecture",
  underwriting: "Loan underwriting decisions",
  "dense-er": "Checkout ledger storage detail",
  "dense-sequence": "Purchase delivery return and refund lifecycle",
  c4: "Checkout system context",
  treeView: "Checkout repository ownership",
  cynefin: "Checkout operational decision contexts",
};
function fixture(id: string) {
  const heading = headings[id];
  assert.ok(heading, id);
  const original = views(originals, heading)[0];
  assert.ok(original);
  return { original, revised: views(revisions, heading) };
}
function body(source: string): string {
  const node = createDocument(source).tree.children[0];
  return source
    .slice(node?.type === "yaml" ? (node.position?.end.offset ?? 0) : 0)
    .trim();
}
async function database(value: string) {
  const core = await getMermaidCore();
  return (await core.mermaidAPI.getDiagramFromText(value)).db;
}

test("initial scenarios cover every supported registered Mermaid detector", async () => {
  await getMermaidCore();
  const mermaid = (await import("mermaid")).default;
  const expected = mermaid
    .getRegisteredDiagramsMetadata()
    .map(({ id }) => id)
    .filter((id) => !["error", "---", "zenuml"].includes(id))
    .sort();
  const actual = new Set<string>();
  for (const node of before) {
    const parsed = await mermaid.parse(node.value);
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(node.value);
    actual.add(mermaid.detectType(diagram.text, parsed.config));
  }
  assert.deepEqual([...actual].sort(), expected);
  assert.equal(actual.size, 38);
});

test("complete revised corpus passes all five native remark policies", async () => {
  assert.equal(before.length, 43);
  assert.equal(after.length, 61);
  const processor = unified().use(remarkParse).use(remarkSlopstopper);
  const file = new VFile(improved);
  await processor.run(processor.parse(file), file);
  assert.deepEqual(
    file.messages.map((m) => m.reason),
    [],
  );
  assert.deepEqual(await analyzeMermaid(improved), []);
});

test("initial feedback includes real complexity and contrast failures without style leakage", async () => {
  const diagnostics = await analyzeMermaid(initial);
  assert.ok(diagnostics.some((d) => d.ruleId === MERMAID_RULES.complexity));
  assert.ok(diagnostics.some((d) => d.ruleId === MERMAID_RULES.contrast));
  assert.ok(!diagnostics.some((d) => d.ruleId === MERMAID_RULES.parse));
  const clean = before[3];
  assert.ok(clean);
  assert.ok(
    !diagnostics.some((d) => d.start >= clean.start && d.start <= clean.end),
  );
  const unreadable = before[2];
  assert.ok(unreadable);
  const failure = diagnostics.filter(
    (d) => d.start >= unreadable.start && d.start <= unreadable.end,
  );
  assert.equal(failure.length, 2);
  assert.ok(failure.every((d) => d.message.includes("1.00:1")));
});

test("palette revisions retain complete diagram bodies and numeric data", () => {
  const changed = new Set([
    ...Object.values(headings),
    "Unreadable label",
    "Clean diagram after the failure",
    "Multiple diagrams: realistic summarisation cases",
    "Extended parser-family corpus",
    "Monthly fulfilment costs",
  ]);
  let compared = 0;
  for (const [title, sources] of originals) {
    if (changed.has(title)) continue;
    assert.equal(sources.length, 1, title);
    assert.equal(
      body(views(revisions, title)[0] ?? ""),
      body(sources[0] ?? ""),
      title,
    );
    compared++;
  }
  assert.equal(compared, 33);
  const treemap = body(views(revisions, "Monthly fulfilment costs")[0] ?? "")
    .split("\nclassDef")[0]
    ?.replace(/:::(?:section|leaf)/g, "");
  assert.equal(
    treemap,
    body(views(originals, "Monthly fulfilment costs")[0] ?? ""),
  );
});

function planSources(plan: SplitPlan): string[] {
  return [
    plan.overviewSource,
    ...plan.details.flatMap((d) =>
      d.split ? planSources(d.split) : [d.source],
    ),
    ...plan.rowDetails.map((r) => r.source),
  ];
}
async function verifySplit(id: string): Promise<void> {
  const item = fixture(id);
  const outcome = await splitOutcome(item.original, thresholdsFrom({}));
  assert.deepEqual(outcome.violations, []);
  assert.ok(outcome.plan, outcome.reason);
  assert.equal(outcome.plan.loss.newReachablePairs, 0);
  assert.equal(outcome.plan.loss.droppedRows, 0);
  assert.deepEqual(
    item.revised.map(body),
    planSources(outcome.plan).map((s) => s.trim()),
    id,
  );
}

test("shop, underwriting and ER outputs retain every fact through verified split contracts", async () => {
  for (const id of ["shop", "underwriting", "dense-er"]) await verifySplit(id);
  const er = fixture("dense-er");
  const stats = await extractStats(er.original);
  assert.equal(stats.rows, 160);
  assert.equal(stats.edges, 20);
  assert.ok(
    calculateComplexity(stats, thresholdsFrom({})).visual_complexity_score > 60,
  );
});

function sequenceRecords(db: SequenceDB) {
  return db
    .getMessages()
    .map(({ from, to, message, type, activate, placement }) => ({
      from,
      to,
      message,
      type,
      activate,
      placement,
    }));
}
async function phaseRecords(item: ReturnType<typeof fixture>) {
  const actual: ReturnType<typeof sequenceRecords> = [];
  const actors = new Set<string>();
  for (const view of item.revised) {
    const db = (await database(view)) as SequenceDB;
    const records = sequenceRecords(db);
    actual.push(...records);
    const used = new Set(records.flatMap((m) => [m.from, m.to]));
    for (const actor of db.getActors().keys()) {
      actors.add(actor);
      assert.ok(used.has(actor), `Unused participant ${actor}`);
    }
  }
  return { actual, actors };
}
test("phase revisions preserve all 112 sequence messages, notes and actor order", async () => {
  const item = fixture("dense-sequence");
  const db = (await database(item.original)) as SequenceDB;
  const { actual, actors } = await phaseRecords(item);
  assert.deepEqual(actual, sequenceRecords(db));
  assert.equal(actual.filter((m) => m.type === 0 || m.type === 1).length, 112);
  assert.deepEqual([...actors].sort(), [...db.getActors().keys()].sort());
  assert.equal(actual.filter((m) => m.type === 2).length, 8);
  const stats = await extractStats(item.original);
  assert.ok(
    calculateComplexity(stats, thresholdsFrom({})).visual_complexity_score > 60,
  );
});

test("C4 translation retains people, system types, descriptions and relationships", async () => {
  const item = fixture("c4");
  const db = (await database(
    item.original,
  )) as typeof import("mermaid/dist/diagrams/c4/c4Db.js");
  const graph = await extractGraph(item.revised[0] ?? "");
  for (const entity of db.getC4ShapeArray()) {
    const node = graph.nodes.find((n) => n.id.toLowerCase() === entity.alias);
    assert.ok(node);
    assert.ok(node.label.includes(entity.label.text));
    assert.ok(
      node.label.toLowerCase().includes(entity.descr?.text.toLowerCase() ?? ""),
    );
    const kind =
      entity.typeC4Shape.text === "person"
        ? "Person"
        : entity.typeC4Shape.text === "external_system"
          ? "External system"
          : "System";
    assert.ok(node.label.includes(kind));
  }
  assert.deepEqual(
    graph.edges.map((e) => [
      e.source.toLowerCase(),
      e.target.toLowerCase(),
      e.label,
    ]),
    db.getRels().map((r) => [r.from, r.to, r.label.text]),
  );
});
function treeEdges(node: ReturnType<TreeViewDB["getRoot"]>): string[] {
  return node.children.flatMap((child) => [
    JSON.stringify([node.name, child.name]),
    ...treeEdges(child),
  ]);
}
test("TreeView translation retains the slash root and every hierarchy edge", async () => {
  const item = fixture("treeView");
  const db = (await database(item.original)) as TreeViewDB;
  const graph = await extractGraph(item.revised[0] ?? "");
  const labels = new Map(graph.nodes.map((n) => [n.id, n.label]));
  assert.deepEqual(
    graph.edges
      .map((e) => JSON.stringify([labels.get(e.source), labels.get(e.target)]))
      .sort(),
    treeEdges(db.getRoot()).sort(),
  );
  assert.equal(graph.nodes.length, 10);
});
test("Cynefin translation retains domain membership and labeled transitions", async () => {
  const item = fixture("cynefin");
  const db = (await database(item.original)) as CynefinDB;
  const graph = await extractGraph(item.revised[0] ?? "");
  for (const [name, domain] of db.getDomains())
    for (const member of domain.items)
      assert.ok(
        graph.nodes.some((n) => n.parent === name && n.label === member.label),
      );
  assert.deepEqual(
    graph.edges.map((e) => [e.source, e.target, e.label]),
    db.getTransitions().map((e) => [e.from, e.to, e.label]),
  );
  assert.equal(graph.subgraphs.length, 5);
});
test("repairing the unreadable label retains its complete graph semantics", async () => {
  const original = views(originals, "Unreadable label")[0];
  const revised = views(revisions, "Repaired label")[0];
  assert.ok(original);
  assert.ok(revised);
  assert.deepEqual(await extractGraph(revised), await extractGraph(original));
});
