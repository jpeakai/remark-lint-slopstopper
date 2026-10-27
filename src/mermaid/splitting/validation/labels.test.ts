import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import { extractGraph } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { laddersOf, planWork } from "../planning/search.ts";
import type { Build } from "../planning/state.ts";
import { checkLabels } from "./labels.ts";

const config = configFromPreset("low-density");
const chain = (prefix: string, n: number): string =>
  Array.from({ length: n }, (_, i) => `${prefix}${i} --> ${prefix}${i + 1}`).join("\n");

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

  if (typeof build === "string") {
    throw new Error(build);
  }

  assert.deepEqual(checkLabels(build), []);

  return build;
}

const groupHolding = (build: Build, member: string) => {
  const group = build.plan.groups.find((g) => g.members.includes(member));

  assert.ok(group);

  return group;
};

// A chain with six leaves off a4, then a region Outer holding Inner.
const source = `flowchart TD\n${chain("a", 9)}\n${Array.from({ length: 6 }, (_, i) => `a4 --> L${i}[Leaf ${i}]`).join("\n")}\nsubgraph O[Outer]\nsubgraph N[Inner]\nn0-->n1\nn1-->n2\nend\nq0\nend\na9-->n0\nn2-->q0`;

test("a group label must come from the data and count what it hides", async () => {
  const build = await buildOf(source);
  const leaves = groupHolding(build, "L0");

  assert.equal(leaves.label, "Leaf 0 (+Leaf 1, Leaf 2, Leaf 3, Leaf 4, Leaf 5)");
  delete leaves.paired;
  leaves.labelBase = "Bogus";

  assert.deepEqual(checkLabels(build), [
    `4: group ${leaves.id} label is not its parts`,
    `4: group ${leaves.id} label "Bogus" is not from the data`,
    `4: group ${leaves.id} counts 0 hidden members`,
  ]);
});

test("a pair label must list the members' own labels", async () => {
  const build = await buildOf(source);
  const leaves = groupHolding(build, "L0");

  leaves.paired = "Leaf 1";
  leaves.label = "Leaf 0 (+Leaf 1)";

  assert.deepEqual(checkLabels(build), [`4: group ${leaves.id} pair label "Leaf 0 (+Leaf 1)" is not its members'`]);
});

test("a span label must name the members' entry and exit", async () => {
  const build = await buildOf(source);
  const outer = groupHolding(build, "q0");

  assert.equal(outer.label, "Outer (+4)");
  outer.spanned = true;

  assert.deepEqual(checkLabels(build), [`4: group ${outer.id} span label "Outer" is not its members' entry and exit`]);
});

test("no two groups show one label and no group shows a node's label", async () => {
  const build = await buildOf(source);
  const outer = groupHolding(build, "q0");
  const leaves = groupHolding(build, "L0");

  outer.label = leaves.label;
  leaves.label = "a0";
  leaves.paired = undefined;

  const violations = checkLabels(build);

  assert.ok(violations.includes('4: group label "a0" is also a node\'s label'));
  outer.label = "a0";

  assert.ok(checkLabels(build).includes("4: two groups show one label"));
});

test("a region group's label must be its region's label", async () => {
  const build = await buildOf(source);
  const outer = groupHolding(build, "q0");

  outer.labelBase = "Bogus";

  assert.deepEqual(checkLabels(build), [
    `4: group ${outer.id} label is not its parts`,
    `4: group ${outer.id} label "Bogus" is not from the data`,
  ]);
});
