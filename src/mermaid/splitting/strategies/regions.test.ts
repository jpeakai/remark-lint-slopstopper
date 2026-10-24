import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import { extractGraph } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph, type WorkGraph } from "../graph/model.ts";
import { directionOf, measuredOf } from "../index.ts";
import type { Candidate } from "../planning/candidates.ts";
import { STRICT } from "../planning/constraints.ts";
import { type Group, partitionOf } from "../planning/state.ts";
import { quotientEdges } from "../projection/quotient.ts";
import { authorRegions, echoesOf } from "./regions.ts";

const workOf = async (source: string): Promise<WorkGraph> => {
  const stats = await extractStats(source);
  return buildWorkGraph(await extractGraph(source), {
    direction: await directionOf(source),
    rows: stats.rows,
    measured: measuredOf(stats),
  });
};

// An author region already folded, as a T3 group.
const folded = (members: string[], region: string, parent: string): Group => ({
  members,
  regions: [region],
  parent,
  tier: "T3",
  reason: "author region",
});

const proposed = (work: WorkGraph, groups: Group[] = []): Candidate[] => {
  const part = partitionOf(groups);
  return authorRegions({
    work,
    part,
    config: configFromPreset("low-density"),
    qedges: quotientEdges(work, part),
    rules: STRICT,
  });
};

const summary = (cs: Candidate[]): string[][] =>
  cs.map((c) => [
    ...(c.regions ?? []),
    "|",
    ...(c.also ?? []).flatMap((a) => a.regions ?? []),
  ]);

// Two cloud regions drawn from one template: public and app subnets each.
const CLOUDS = [
  "flowchart LR",
  "  subgraph east [East]",
  "    subgraph epub [public]",
  "      e1 --> e2",
  "    end",
  "    subgraph eapp [app]",
  "      e3 --> e4",
  "    end",
  "  end",
  "  subgraph west [West]",
  "    subgraph wpub [public]",
  "      w1 --> w2",
  "    end",
  "    subgraph wapp [app]",
  "      w3 --> w4",
  "    end",
  "  end",
  "  e2 --> e3",
  "  w2 --> w3",
  "  e4 --> w1",
].join("\n");

test("sibling regions of one shape echo each other", async () => {
  const work = await workOf(CLOUDS);
  assert.deepEqual(echoesOf(work, "east"), ["west"]);
});

test("a subnet echoes the subnet of its label in the echoing region", async () => {
  const work = await workOf(CLOUDS);
  assert.deepEqual(echoesOf(work, "epub"), ["wpub"]);
  assert.deepEqual(echoesOf(work, "wapp"), ["eapp"]);
});

test("an unknown region echoes nothing", async () => {
  const work = await workOf(CLOUDS);
  assert.deepEqual(echoesOf(work, "north"), []);
});

test("innermost regions fold first, each with its echo", async () => {
  const work = await workOf(CLOUDS);
  const cs = proposed(work);
  assert.deepEqual(summary(cs), [
    ["eapp", "|", "wapp"],
    ["epub", "|", "wpub"],
    ["wapp", "|", "eapp"],
    ["wpub", "|", "epub"],
  ]);
  assert.deepEqual(cs[0]?.keys, ["e3", "e4"]);
  assert.equal(cs[0]?.parent, "east");
  assert.equal(cs[0]?.tier, "T3");
});

test("a region waits while its echo still has subnets to fold", async () => {
  const work = await workOf(CLOUDS);
  const cs = proposed(work, [
    folded(["e1", "e2"], "epub", "east"),
    folded(["e3", "e4"], "eapp", "east"),
  ]);
  assert.deepEqual(summary(cs), [
    ["wapp", "|"],
    ["wpub", "|"],
  ]);
});

test("echoing regions fold together once every subnet has folded", async () => {
  const work = await workOf(CLOUDS);
  const cs = proposed(work, [
    folded(["e1", "e2"], "epub", "east"),
    folded(["e3", "e4"], "eapp", "east"),
    folded(["w1", "w2"], "wpub", "west"),
    folded(["w3", "w4"], "wapp", "west"),
  ]);
  assert.deepEqual(summary(cs), [
    ["east", "|", "west"],
    ["west", "|", "east"],
  ]);
});

test("a region is ready when its children hold one node or none", async () => {
  const work = await workOf(
    [
      "flowchart LR",
      "  subgraph X [outer]",
      "    subgraph Y [inner]",
      "      n1",
      "    end",
      "    subgraph Z [empty]",
      "    end",
      "    n2 --> n3",
      "  end",
      "  n1 --> n2",
      "  n3 --> n4",
    ].join("\n"),
  );
  const cs = proposed(work);
  assert.equal(cs.length, 1);
  assert.deepEqual(cs[0]?.keys, ["n1", "n2", "n3"]);
  assert.deepEqual(cs[0]?.regions, ["X", "Y", "Z"]);
  assert.equal(cs[0]?.parent, null);
});

test("a composite state folds with the states its start marker pins", async () => {
  const work = await workOf(
    [
      "stateDiagram-v2",
      "  state Outer {",
      "    [*] --> a",
      "    a --> Inner",
      "    state Inner {",
      "      [*] --> b",
      "      b --> c",
      "      c --> [*]",
      "    }",
      "    Inner --> d",
      "  }",
      "  Outer --> e",
    ].join("\n"),
  );
  const cs = proposed(work);
  assert.deepEqual(
    cs.map((c) => [c.keys, c.regions, c.parent]),
    [[["Inner", "b", "c"], ["Inner__group"], "Outer__group"]],
  );
});
