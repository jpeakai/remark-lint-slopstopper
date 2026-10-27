import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import { type DiagramGraph, extractGraph, type GraphEdge } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { laddersOf, planWork } from "../planning/search.ts";
import { type Build, partitionOf } from "../planning/state.ts";
import { emitSource } from "../presentation/serialize.ts";
import { detailView } from "../projection/detail.ts";
import { quotientEdges, scoreOf } from "../projection/quotient.ts";
import { checkContract } from "./contract.ts";

const config = configFromPreset("low-density");
const source = "classDiagram\nclass A {\n+String first\n}\nclass B {\n+String second\n}\nA --> B";

async function rowBuild(): Promise<Build> {
  const stats = await extractStats(source);
  const work = buildWorkGraph(await extractGraph(source), {
    direction: "TD",
    rows: stats.rows,
    measured: {
      nodes: stats.nodes,
      edges: stats.edges,
      subgraphs: stats.subgraphs,
      depth: stats.max_subgraph_depth,
    },
  });
  const build = planWork(work, config, 0);

  assert.notEqual(typeof build, "string");

  if (typeof build === "string") {
    throw new Error(build);
  }

  assert.equal(build.plan.rowDetails.length, 1);
  assert.deepEqual(await checkContract(build, config), []);

  return build;
}

test("row diagrams cannot invent nodes even with a matching source and score", async () => {
  const build = await rowBuild();
  const graph: DiagramGraph = {
    diagram_type: "classDiagram",
    nodes: [{ id: "phantom", label: "Invented", parent: null }],
    edges: [],
    subgraphs: [],
  };

  build.plan.rowDetails.push({
    members: ["phantom"],
    graph,
    source: emitSource(build.work, { graph, stubs: new Set() }),
    nodes: 1,
    score: scoreOf({ nodes: 1, edges: 0, subgraphs: 0, depth: 0 }, 0, config),
  });

  assert.ok(
    (await checkContract(build, config)).includes("5: row diagram 2 is not a diagram of its original kept nodes"),
  );
});

test("row diagram declarations and labels must refer to the original kept nodes", async () => {
  const build = await rowBuild();
  const detail = build.plan.rowDetails[0];

  assert.ok(detail);
  detail.members = ["B"];

  assert.ok((await checkContract(build, config)).some((v) => v.startsWith("5: row diagram 1")));
  detail.members = detail.graph.nodes.map((n) => n.id);

  const node = detail.graph.nodes[0];

  assert.ok(node);
  node.label = "An invented label";
  detail.source = emitSource(build.work, {
    graph: detail.graph,
    stubs: new Set(),
  });

  assert.ok((await checkContract(build, config)).some((v) => v.startsWith("5: row diagram 1")));
});

const groups = partitionOf([
  {
    members: ["a1", "a2"],
    regions: [],
    parent: null,
    tier: "T5",
    reason: "test",
  },
  {
    members: ["b1", "b2"],
    regions: [],
    parent: null,
    tier: "T5",
    reason: "test",
  },
]);

function edgeWork(edges: GraphEdge[], diagram_type = "flowchart") {
  return buildWorkGraph(
    {
      diagram_type,
      nodes: ["a1", "a2", "b1", "b2"].map((id) => ({
        id,
        label: id,
        parent: null,
      })),
      edges,
      subgraphs: [],
    },
    {
      direction: "TD",
      rows: 0,
      measured: { nodes: 4, edges: edges.length, subgraphs: 0, depth: 0 },
    },
  );
}

test("overview and incoming detail halves both discard a conflicting markdown label", () => {
  const work = edgeWork([
    {
      id: "e1",
      source: "a1",
      target: "b1",
      label: "Same text",
      markdown: true,
      kind: "-->",
    },
    { id: "e2", source: "a2", target: "b1", label: "Same text", kind: "-->" },
  ]);
  const overview = quotientEdges(work, groups);

  assert.equal(overview.length, 1);
  assert.equal(overview[0]?.label, undefined);
  assert.equal(overview[0]?.markdown, undefined);
  assert.deepEqual(
    overview[0]?.covers,
    work.edges.map((edge) => edge.id),
  );

  const group = groups.groups[1];

  assert.ok(group);

  const detail = detailView(work, groups, group);

  assert.equal(detail.edges.length, 1);
  assert.equal(detail.edges[0]?.label, undefined);
  assert.equal(detail.edges[0]?.markdown, undefined);
  assert.equal(detail.edges[0]?.kind, "-->");
});

test("kept repeated edges stay separate while grouped ER cardinalities remain distinct", () => {
  const edges = [
    { id: "e1", source: "a1", target: "b1", kind: "-->", cardinality: "one" },
    { id: "e2", source: "a1", target: "b1", kind: "-->", cardinality: "many" },
  ];

  assert.equal(quotientEdges(edgeWork(edges), partitionOf([])).length, 2);
  assert.equal(quotientEdges(edgeWork(edges, "er"), groups).length, 2);
});

const chain = (prefix: string, n: number): string =>
  Array.from({ length: n }, (_, i) => `${prefix}${i} --> ${prefix}${i + 1}`).join("\n");

async function buildOf(text: string): Promise<Build> {
  const stats = await extractStats(text);
  const work = buildWorkGraph(await extractGraph(text), {
    direction: "TB",
    rows: stats.rows,
    measured: {
      nodes: stats.nodes,
      edges: stats.edges,
      subgraphs: stats.subgraphs,
      depth: stats.max_subgraph_depth,
    },
  });
  const build = planWork(work, config, 0, laddersOf(work)[0]);

  if (typeof build === "string") {
    throw new Error(build);
  }

  assert.deepEqual(await checkContract(build, config), []);

  return build;
}

test("an overview below the floor is reported", async () => {
  const build = await rowBuild();

  build.plan.overviewNodes = 0;

  assert.ok((await checkContract(build, config)).includes("9: the overview holds 0 nodes, fewer than 1"));
});

test("a decision folds only with its whole decision region", async () => {
  const build = await buildOf(
    `flowchart TD\n${chain("a", 6)}\na6 --> D{Choose}\nD --> p1\nD --> q1\np1 --> J\nq1 --> J\nJ --> b0\n${chain("b", 6)}`,
  );
  const group = build.plan.groups.find((g) => g.members.includes("D"));

  assert.ok(group);
  assert.ok(group.members.includes("q1"));
  group.members = group.members.filter((m) => m !== "q1");

  assert.ok((await checkContract(build, config)).includes(`6: protected D is folded in ${group.id}`));
});

test("start and end transitions merged onto a group stand for every transition they merge", async () => {
  const build = await buildOf(
    `stateDiagram-v2\n[*] --> S0\n${chain("S", 12)}\nS12 --> C\nstate C {\n[*] --> I0\n${chain("I", 8)}\nI8 --> [*]\n}\nC --> T0\n${chain("T", 6)}\nT6 --> [*]\nS3 --> [*]\nS5 --> [*]: quit`,
  );
  const pseudo = build.plan.overview.pseudo;
  const group = build.plan.groups.find((g) => g.members.includes("S5"));
  const merged = pseudo?.edges.find((e) => e.source === group?.id);

  assert.ok(pseudo && group && merged);
  assert.equal(merged.label, undefined);
  merged.label = "quit";

  const labelled = await checkContract(build, config);

  assert.ok(
    labelled.includes(
      `7: the transition of ${merged.target} onto ${group.id} carries a label not all of its transitions carry`,
    ),
  );
  pseudo.edges = pseudo.edges.filter((e) => e !== merged);
  build.plan.loss.mergedMarkers = 0;

  const dropped = await checkContract(build, config);

  assert.ok(dropped.includes(`7: the transition of ${merged.target} into ${group.id} is not drawn onto its group`));
  assert.ok(dropped.includes("7: the declared merged start and end transitions are wrong"));
});
