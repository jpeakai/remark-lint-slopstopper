import assert from "node:assert/strict";
import { test } from "node:test";
import { extractGraph } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph, type WorkGraph } from "../graph/model.ts";
import { directionOf, measuredOf } from "../index.ts";
import {
  hubsOf,
  RELAXED,
  STRICT,
  splitsBranches,
  terminalsOf,
} from "./constraints.ts";

const workOf = async (source: string): Promise<WorkGraph> => {
  const stats = await extractStats(source);
  return buildWorkGraph(await extractGraph(source), {
    direction: await directionOf(source),
    rows: stats.rows,
    measured: measuredOf(stats),
  });
};

test("rules relax from strict to groups hiding a single node", () => {
  assert.deepEqual(RELAXED[0], STRICT);
  assert.deepEqual(
    RELAXED.map((r) => [
      r.keepHubs,
      r.keepTerminals,
      r.keepBranches,
      r.keepFamilies,
      r.minHidden,
    ]),
    [
      [true, true, true, true, 2],
      [true, true, true, false, 2],
      [false, true, false, true, 2],
      [false, true, false, false, 2],
      [false, false, false, false, 2],
      [false, false, false, false, 1],
    ],
  );
});

test("a hub has degree four or more and sits in the top tenth", async () => {
  const work = await workOf(
    "flowchart LR\n  H --> A\n  H --> B\n  H --> C\n  H --> D\n  A --> B",
  );
  assert.deepEqual([...hubsOf(work)], ["H"]);
  assert.equal(hubsOf(work), hubsOf(work));
});

test("a node of degree three is never a hub", async () => {
  const work = await workOf("flowchart LR\n  H --> A\n  H --> B\n  H --> C");
  assert.deepEqual([...hubsOf(work)], []);
});

test("a flowchart node three others end at is a shared terminal", async () => {
  const work = await workOf(
    "flowchart LR\n  A --> N\n  B --> N\n  C --> N\n  S --> A\n  S --> B\n  S --> C",
  );
  assert.deepEqual([...terminalsOf(work)].sort(), ["N"]);
  assert.equal(terminalsOf(work), terminalsOf(work));
});

test("a terminal may lead on to nodes that lead nowhere", async () => {
  const work = await workOf(
    "flowchart LR\n  A --> N\n  B --> N\n  C --> N\n  N --> Done",
  );
  assert.deepEqual([...terminalsOf(work)].sort(), ["N"]);
});

test("an undirected link keeps a node from ending the flow", async () => {
  const work = await workOf(
    "flowchart LR\n  A --> N\n  B --> N\n  C --> N\n  N --- Z",
  );
  assert.deepEqual([...terminalsOf(work)], []);
});

test("only flowcharts and state diagrams have shared terminals", async () => {
  const work = await workOf(
    "classDiagram\n  A --> N\n  B --> N\n  C --> N\n  D --> N",
  );
  assert.equal(work.family, "class");
  assert.deepEqual([...terminalsOf(work)], []);
});

const DECISION = [
  "flowchart TD",
  "  Q{Approve?} -->|yes| Y[Ship]",
  "  Q -->|no| N[Reject]",
  "  Y --> YD[Shipped]",
  "  N --> ND[Rejected]",
].join("\n");

test("a group holding both targets of differently labelled branches splits them", async () => {
  const work = await workOf(DECISION);
  assert.equal(splitsBranches(work, ["Y", "N"]), true);
  assert.equal(splitsBranches(work, ["Y", "YD", "N", "ND"]), true);
});

test("a group holding one branch target does not split the decision", async () => {
  const work = await workOf(DECISION);
  assert.equal(splitsBranches(work, ["Y", "YD"]), false);
});

test("a group holding the whole decision region keeps its branches", async () => {
  const work = await workOf(
    [
      "flowchart TD",
      "  S --> Q{Approve?}",
      "  Q -->|yes| Y[Ship]",
      "  Q -->|no| N[Reject]",
      "  Y --> J[Close]",
      "  N --> J",
      "  J --> E",
    ].join("\n"),
  );
  assert.equal(splitsBranches(work, ["Q", "Y", "N", "J"]), false);
});

test("branches that rejoin inside the group are not split", async () => {
  const work = await workOf(
    [
      "flowchart TD",
      "  S --> Q{Approve?}",
      "  Q -->|yes| Y[Ship]",
      "  Q -->|no| N[Reject]",
      "  Y --> J[Close]",
      "  N --> J",
    ].join("\n"),
  );
  assert.equal(splitsBranches(work, ["Y", "N", "J"]), false);
});

test("targets reached only by one shared label are not apart", async () => {
  const work = await workOf(
    [
      "flowchart TD",
      "  Q{Route} -->|a| X",
      "  Q -->|a| Y",
      "  Q -->|b| Z",
    ].join("\n"),
  );
  assert.equal(splitsBranches(work, ["X", "Y"]), false);
  assert.equal(splitsBranches(work, ["X", "Z"]), true);
});
