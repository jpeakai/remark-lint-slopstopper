import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../complexity/metrics.ts";
import { extractStats } from "../parsing/statistics.ts";
import { DENSE_MESH, directionOf, isDenseMesh, isStar, measuredOf, STAR, splitOutcome } from "./index.ts";

const LOW = configFromPreset("low-density");

const lines = (...body: string[]): string => body.join("\n");

// Every pair of the given ids joined once, with no direction.
const complete = (ids: string[]): string[] => ids.flatMap((a, i) => ids.slice(i + 1).map((b) => `  ${a} --- ${b}`));

const pairs = (edges: Array<[string, string]>) => ({
  nodes: [...new Set(edges.flat())].map((id) => ({
    id,
    label: id,
    parent: null,
  })),
  edges: edges.map(([source, target], i) => ({
    id: String(i),
    source,
    target,
  })),
});

test("a graph joining every pair of six nodes is a dense mesh", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const all = ids.flatMap((a, i) => ids.slice(i + 1).map((b): [string, string] => [a, b]));

  assert.equal(isDenseMesh(pairs(all)), true);
});

test("a complete graph of five nodes averages exactly a hub's links, no mesh", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const all = ids.flatMap((a, i) => ids.slice(i + 1).map((b): [string, string] => [a, b]));

  assert.equal(isDenseMesh(pairs(all)), false);
});

test("a complete graph of four nodes averages too few links to be a mesh", () => {
  const ids = ["a", "b", "c", "d"];
  const all = ids.flatMap((a, i) => ids.slice(i + 1).map((b): [string, string] => [a, b]));

  assert.equal(isDenseMesh(pairs(all)), false);
});

test("edges both ways and self loops count one pair each", () => {
  assert.equal(
    isDenseMesh(
      pairs([
        ["a", "b"],
        ["b", "a"],
        ["a", "a"],
      ]),
    ),
    false,
  );
  assert.equal(isDenseMesh({ nodes: [], edges: [] }), false);
});

test("the direction is the one mermaid parsed", async () => {
  assert.equal(await directionOf("flowchart RL\n  A --> B"), "RL");
  assert.equal(await directionOf("graph TD\n  A --> B"), "TB");
});

test("a diagram is measured by its deeper nesting", async () => {
  const stats = await extractStats(
    lines("flowchart LR", "  subgraph outer", "    subgraph inner", "      A --> B", "    end", "  end", "  B --> C"),
  );

  assert.deepEqual(measuredOf(stats), {
    nodes: 3,
    edges: 2,
    subgraphs: 2,
    depth: 2,
  });
});

test("a diagram that does not parse is refused", async () => {
  const outcome = await splitOutcome("flowchart LR\n  A -->", LOW);

  assert.equal(outcome.plan, null);
  assert.match(outcome.reason, /^the diagram does not parse: /);
});

test("a sequence diagram is refused for its message order", async () => {
  const outcome = await splitOutcome("sequenceDiagram\n  Alice->>Bob: hi", LOW);

  assert.equal(outcome.reason, "a sequence diagram is not split: its graph drops message order");
});

test("a family with no graph contract is refused by name", async () => {
  const outcome = await splitOutcome('pie\n  "a" : 1\n  "b" : 2', LOW);

  assert.equal(outcome.plan, null);
  assert.match(outcome.reason, /^a \S+ diagram is not split$/);
});

test("a diagram within its target is not split", async () => {
  const outcome = await splitOutcome("flowchart LR\n  A --> B", LOW);

  assert.deepEqual(outcome, {
    plan: null,
    reason: "the diagram is already within the target",
    violations: [],
  });
});

test("a composite state with concurrent regions is not split", async () => {
  const body = Array.from({ length: 8 }, (_, i) => `    s${i} --> t${i}\n    --`).join("\n");

  const outcome = await splitOutcome(
    lines("stateDiagram-v2", "  state Busy {", body, "    last --> done", "  }", "  [*] --> Busy"),
    LOW,
  );

  assert.equal(outcome.reason, "concurrent state regions are not split");
});

test("a complete graph is refused with an adjacency matrix", async () => {
  const ids = "ABCDEFGHIJKL".split("");

  const outcome = await splitOutcome(lines("flowchart LR", ...complete(ids)), LOW);

  assert.equal(outcome.reason, DENSE_MESH);
  assert.equal(outcome.alternative?.kind, "matrix");
  assert.match(outcome.alternative?.markdown ?? "", /^12 nodes, 66 of 66 pairs linked/);
});

test("hubs all joined to each other fold to a mesh, so a matrix is offered", async () => {
  const hubs = ["H1", "H2", "H3", "H4", "H5", "H6"];
  const leaves = hubs.flatMap((h, g) => ["a", "b", "c"].map((x) => `  ${h} --> N${g + 1}${x}[leaf ${g + 1} ${x}]`));

  const outcome = await splitOutcome(
    lines("flowchart LR", ...leaves, ...hubs.flatMap((a, i) => hubs.slice(i + 1).map((b) => `  ${a} --> ${b}`))),
    LOW,
  );

  assert.equal(outcome.reason, DENSE_MESH);
  assert.equal(outcome.alternative?.kind, "matrix");
  assert.match(outcome.alternative?.markdown ?? "", /^24 nodes, 33 of 276 pairs linked/);
});

test("a star of unsorted leaves is refused with a list", async () => {
  const outcome = await splitOutcome(
    lines("flowchart LR", ...Array.from({ length: 20 }, (_, i) => `  H --> L${i + 1}[item ${i + 1}]`)),
    LOW,
  );

  assert.equal(outcome.reason, STAR);
  assert.equal(outcome.alternative?.kind, "list");
  assert.match(outcome.alternative?.markdown ?? "", /^- \*\*H\*\*, 20 links:/);
});

test("nodes nothing joins cannot fold, so no tier reaches the target", async () => {
  const outcome = await splitOutcome(
    lines("flowchart LR", ...Array.from({ length: 30 }, (_, i) => `  I${i}[lonely ${i}]`)),
    LOW,
  );

  assert.equal(outcome.plan, null);
  assert.equal(outcome.reason, "no tier reaches the target: the overview stops at 30 nodes and a score of 30");
});

test("a planned ring is no star: its groups are not sibling leaves", async () => {
  const ring = "ABCDEFGHIJKL".split("");

  const outcome = await splitOutcome(
    lines(
      "flowchart LR",
      ...ring.map((a, i) => `  ${a} --> ${ring[(i + 1) % ring.length]}`),
      "  A --> G",
      "  C --> J",
      "  E --> L",
      "  B --> H",
    ),
    LOW,
  );

  assert.ok(outcome.plan, outcome.reason);
  assert.equal(outcome.reason, "");
  assert.equal(isStar(outcome.plan, 12), false);
});
