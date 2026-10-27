import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import { extractGraph } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { laddersOf, planWork } from "../planning/search.ts";
import type { Build } from "../planning/state.ts";
import { checkRoundTrip } from "./round-trip.ts";

const config = configFromPreset("low-density");
const chain = (prefix: string, n: number): string =>
  Array.from({ length: n }, (_, i) => `${prefix}${i} --> ${prefix}${i + 1}`).join("\n");

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

  if (typeof build === "string") {
    throw new Error(build);
  }

  assert.deepEqual(await checkRoundTrip(build, config), []);

  return build;
}

const source = clusters("a1 --> b1\na2 --> b2\na3 --> b3");

test("an emitted overview that does not parse is reported", async () => {
  const build = await buildOf(source);

  build.plan.overviewSource = "flowchart TD\nA -->";

  const [first] = await checkRoundTrip(build, config);

  assert.ok(first?.startsWith("9: the overview does not parse: "));
});

test("an emitted overview must parse to the counts planned", async () => {
  const build = await buildOf(source);

  build.plan.overviewSource += "\n  Extra";

  assert.deepEqual(await checkRoundTrip(build, config), [
    "9: the overview parses to 8/6/0 nodes/edges/subgraphs, not 7/6/0",
    "9: the overview score is not what was planned",
  ]);
});

test("an emitted overview must parse to the elements planned", async () => {
  const build = await buildOf(source);

  build.plan.overviewSource = build.plan.overviewSource.replace('Y["Y"]', 'Y["Why"]');

  assert.deepEqual(await checkRoundTrip(build, config), [
    '9: the overview parses to other elements than planned: ["node","Y","Why",false,null,"square",[],[]] ["node","Y","Y",false,null,"square",[],[]]',
  ]);
});

test("an emitted diagram over a stricter target is reported", async () => {
  const build = await buildOf(source);
  const strict = { ...config, node_target: 3 };

  const violations = await checkRoundTrip(build, strict);

  assert.ok(violations.some((v) => v.startsWith("9: the overview measures 7 nodes and")));
});
