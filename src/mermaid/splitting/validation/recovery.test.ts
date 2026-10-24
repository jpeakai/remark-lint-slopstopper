import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import { extractGraph } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { laddersOf, planWork } from "../planning/search.ts";
import type { Build } from "../planning/state.ts";
import { checkRecoverable } from "./recovery.ts";

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
  assert.deepEqual(checkRecoverable(build), []);
  return build;
}

const detailOf = (build: Build, member: string) => {
  const detail = build.plan.details.find((d) =>
    d.graph.nodes.some((n) => n.id === member),
  );
  assert.ok(detail);
  return detail;
};

const groupHolding = (build: Build, member: string) => {
  const group = build.plan.groups.find((g) => g.members.includes(member));
  assert.ok(group);
  return group;
};

test("a box must show exactly one group's label and stand for what that group stands for", async () => {
  const build = await buildOf(clusters("a1 --> b1\na2 --> b2\na3 --> b3"));
  const alpha = detailOf(build, "a0");
  const box = alpha.graph.subgraphs.find((s) => s.label === "Beta (+5)");
  assert.ok(box);
  box.label = "Gamma";
  assert.ok(
    checkRecoverable(build).includes(
      `5: box ${box.id} of ${alpha.group}, "Gamma", shows no one group's label`,
    ),
  );
  box.label = "Beta (+5)";
  box.parent = "A";
  assert.ok(
    checkRecoverable(build).includes(
      `5: box ${box.id} of ${alpha.group} sits inside A`,
    ),
  );
  box.parent = null;
  // Once Beta no longer folds region B whole, the box stands for the group.
  const beta = groupHolding(build, "b0");
  beta.regions = [];
  alpha.graph.edges.push({ id: "extra", source: box.id, target: "a0" });
  const violations = checkRecoverable(build);
  assert.ok(
    violations.includes(
      `5: box ${box.id} of ${alpha.group} reads as ${beta.id}, not B`,
    ),
  );
  assert.ok(
    violations.includes(
      `5: box ${box.id} of ${alpha.group} draws an edge for a whole group`,
    ),
  );
});

test("a stub inside a box must show the label of the one member it stands for", async () => {
  const build = await buildOf(clusters("a1 --> b1\na2 --> b2\na3 --> b3"));
  const alpha = detailOf(build, "a0");
  const stub = alpha.graph.nodes.find((n) => n.label === "b2");
  assert.ok(stub?.parent);
  stub.label = "b3";
  assert.ok(
    checkRecoverable(build).includes(
      `5: stub ${stub.id} in box ${stub.parent} of ${alpha.group}, "b3", reads as b3, not b2`,
    ),
  );
});

test("a stub outside a box must read as its endpoint alone", async () => {
  const build = await buildOf(clusters("a1 --> b1\na2 --> b2\na3 --> b3"));
  const alpha = detailOf(build, "a0");
  const stub = alpha.graph.nodes.find((n) => n.label === "X");
  assert.ok(stub);
  stub.label = "Nobody";
  assert.ok(
    checkRecoverable(build).includes(
      `5: stub ${stub.id} of ${alpha.group}, "Nobody", reads as nothing, not X`,
    ),
  );
});

test("a whole group's stub may name the member its edges leave, only when that member draws them", async () => {
  const build = await buildOf(clusters("a1 --> b1\nb3 --> a2"));
  const beta = detailOf(build, "b0");
  const alpha = groupHolding(build, "a0");
  const stub = beta.graph.nodes.find((n) => n.label === alpha.label);
  assert.ok(stub);
  stub.label = `${alpha.label} from a1`;
  assert.deepEqual(checkRecoverable(build), []);
  stub.label = `${alpha.label} from a2`;
  assert.ok(
    checkRecoverable(build).includes(
      `5: stub ${stub.id} of ${beta.group} names a member that does not draw its edges`,
    ),
  );
});

test("a detail never draws a group whole beside a stub for one of its members", async () => {
  const build = await buildOf(clusters("a1 --> b1\na1 --> b2\na1 --> b3"));
  const alpha = detailOf(build, "a0");
  const beta = groupHolding(build, "b0");
  assert.ok(Object.values(alpha.stubs).includes(beta.id));
  alpha.stubs.s99 = "b1";
  assert.ok(
    checkRecoverable(build).includes(
      `5: detail ${alpha.group} draws ${beta.id} whole beside a stub for one of its members`,
    ),
  );
});

test("labelled edges between groups come back once from their targets", async () => {
  const build = await buildOf(
    clusters("a1 -- go --> b1\na2 -- go --> b2\na3 -- stop --> b3"),
  );
  const beta = detailOf(build, "b0");
  const halves = beta.graph.edges.filter((e) => beta.stubs[e.source]);
  assert.ok(halves.length > 0);
  beta.graph.edges.push(...halves.map((e) => ({ ...e, id: `${e.id}_again` })));
  assert.ok(
    checkRecoverable(build).includes(
      "5: a detail draws one edge from a group twice",
    ),
  );
});

test("a node's rows come back once, as its own", async () => {
  const build = await buildOf(
    "classDiagram\nclass A {\n+String first\n}\nclass B {\n+String second\n}\nA --> B",
  );
  const [row] = build.plan.rowDetails;
  assert.ok(row);
  const node = row.graph.nodes.find((n) => n.id === "A");
  assert.ok(node);
  build.plan.rowDetails.push({
    ...row,
    members: ["A"],
    graph: { ...row.graph, nodes: [{ ...node, rows: ["+String other"] }] },
  });
  const violations = checkRecoverable(build);
  assert.ok(violations.includes("5: the rows of A are not its own"));
  assert.ok(violations.includes("5: the rows of A are drawn 2 times"));
});
