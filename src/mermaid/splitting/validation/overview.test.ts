import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import { extractGraph } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { laddersOf, planWork } from "../planning/search.ts";
import type { Build } from "../planning/state.ts";
import { checkEdges, checkPartition } from "./overview.ts";

const config = configFromPreset("low-density");
const chain = (prefix: string, n: number): string =>
  Array.from(
    { length: n },
    (_, i) => `${prefix}${i} --> ${prefix}${i + 1}`,
  ).join("\n");
// Two author regions, Alpha (a0..a3) and Beta (b0..b4), joined as given.
const clusters = (joins: string): string =>
  `flowchart TD\nsubgraph A[Alpha]\n${chain("a", 3)}\nend\nsubgraph B[Beta]\n${chain("b", 4)}\nend\n${joins}\nX --> a0\nb4 --> Y\nY --> Z\nZ --> W\nW --> V`;

async function buildOf(source: string): Promise<Build> {
  const stats = await extractStats(source);
  const work = buildWorkGraph(await extractGraph(source), {
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
  if (typeof build === "string") throw new Error(build);
  assert.deepEqual(checkEdges(build), []);
  return build;
}

const edgeId = (build: Build, source: string, target: string): string => {
  const edge = build.work.edges.find(
    (e) => e.source === source && e.target === target,
  );
  assert.ok(edge);
  return edge.id;
};

const overviewEdge = (build: Build, source: string, target: string) => {
  const edge = build.plan.overview.edges.find(
    (e) => e.source === source && e.target === target,
  );
  assert.ok(edge);
  return edge;
};

test("an overview edge standing for nothing leaves its original edges uncovered", async () => {
  const build = await buildOf(clusters("a1 --> b1"));
  const [alpha, beta] = build.plan.groups;
  assert.ok(alpha && beta);
  build.covers[overviewEdge(build, alpha.id, beta.id).id] = [];
  assert.deepEqual(checkEdges(build), [
    `2: overview edge ${alpha.id} -> ${beta.id} stands for no original edge`,
    "2: original edge a1 -> b1 is covered 0 times",
  ]);
});

test("an overview edge between kept nodes stands for exactly one edge", async () => {
  const build = await buildOf(clusters("a1 --> b1"));
  const edge = overviewEdge(build, "Y", "Z");
  const zw = edgeId(build, "Z", "W");
  build.covers[edge.id] = [edgeId(build, "Y", "Z"), zw];
  assert.deepEqual(checkEdges(build), [
    `2: overview edge ${edge.id} between kept nodes merges 2 edges`,
    `2: overview edge ${edge.id} covers ${zw} from elsewhere`,
    "2: original edge Z -> W is covered 2 times",
  ]);
});

const groupHolding = (build: Build, member: string) => {
  const group = build.plan.groups.find((g) => g.members.includes(member));
  assert.ok(group);
  return group;
};

// A chain with six leaves off a4, then a region Outer holding Inner.
const nested = `flowchart TD\n${chain("a", 9)}\n${Array.from({ length: 6 }, (_, i) => `a4 --> L${i}[Leaf ${i}]`).join("\n")}\nsubgraph O[Outer]\nsubgraph N[Inner]\nn0-->n1\nn1-->n2\nend\nq0\nend\na9-->n0\nn2-->q0`;

test("every original node sits in exactly one overview node", async () => {
  const build = await buildOf(nested);
  const leaves = groupHolding(build, "L0");
  leaves.members.push("ghost", "a0");
  assert.deepEqual(checkPartition(build), [
    "1: node a0 is in 2 overview nodes",
    "1: ghost is not an original node",
  ]);
});

test("a group folds whole regions inside the region it sits in", async () => {
  const build = await buildOf(nested);
  const outer = groupHolding(build, "q0");
  assert.deepEqual(outer.regions, ["N", "O"]);
  outer.regions = ["N"];
  assert.deepEqual(checkPartition(build), [
    `1: q0 crosses the regions of group ${outer.id}`,
    `1: region N crosses group ${outer.id}`,
  ]);
  outer.regions = ["O"];
  outer.parent = "O";
  assert.deepEqual(checkPartition(build), [
    `1: group ${outer.id} sits inside a region it folds`,
    `1: n0 crosses the regions of group ${outer.id}`,
    `1: n1 crosses the regions of group ${outer.id}`,
    `1: n2 crosses the regions of group ${outer.id}`,
    `1: region O crosses group ${outer.id}`,
    `1: region N is left out of group ${outer.id}`,
  ]);
});

test("a group leaving out a node of a region it folds is reported", async () => {
  const build = await buildOf(nested);
  const outer = groupHolding(build, "q0");
  outer.members = outer.members.filter((m) => m !== "n1");
  assert.deepEqual(checkPartition(build), [
    "1: node n1 is in 0 overview nodes",
    `1: n1 is left out of a region group ${outer.id} folds`,
  ]);
});

test("a suggested group must be connected", async () => {
  const build = await buildOf(nested);
  const first = groupHolding(build, "a1");
  const second = groupHolding(build, "a5");
  assert.deepEqual(
    [first.members, second.members],
    [
      ["a1", "a2", "a3"],
      ["a5", "a6", "a7"],
    ],
  );
  first.members = ["a1", "a3", "a6"];
  second.members = ["a2", "a5", "a7"];
  first.tier = "T6";
  assert.deepEqual(checkPartition(build), [
    `1: suggested group ${first.id} is not connected`,
  ]);
});
