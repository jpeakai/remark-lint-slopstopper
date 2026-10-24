import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import {
  type DiagramGraph,
  extractGraph,
  type GraphEdge,
} from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { planWork } from "../planning/search.ts";
import { type Build, partitionOf } from "../planning/state.ts";
import { emitSource } from "../presentation/serialize.ts";
import { detailView } from "../projection/detail.ts";
import { quotientEdges, scoreOf } from "../projection/quotient.ts";
import { checkContract } from "./contract.ts";

const config = configFromPreset("low-density");
const source =
  "classDiagram\nclass A {\n+String first\n}\nclass B {\n+String second\n}\nA --> B";

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
  if (typeof build === "string") throw new Error(build);
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
    (await checkContract(build, config)).includes(
      "5: row diagram 2 is not a diagram of its original kept nodes",
    ),
  );
});

test("row diagram declarations and labels must refer to the original kept nodes", async () => {
  const build = await rowBuild();
  const detail = build.plan.rowDetails[0];
  assert.ok(detail);
  detail.members = ["B"];
  assert.ok(
    (await checkContract(build, config)).some((v) =>
      v.startsWith("5: row diagram 1"),
    ),
  );
  detail.members = detail.graph.nodes.map((n) => n.id);
  const node = detail.graph.nodes[0];
  assert.ok(node);
  node.label = "An invented label";
  detail.source = emitSource(build.work, {
    graph: detail.graph,
    stubs: new Set(),
  });
  assert.ok(
    (await checkContract(build, config)).some((v) =>
      v.startsWith("5: row diagram 1"),
    ),
  );
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
