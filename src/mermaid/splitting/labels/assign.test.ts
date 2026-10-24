import assert from "node:assert/strict";
import { test } from "node:test";
import { extractGraph } from "../../parsing/graph.ts";
import { buildWorkGraph, type WorkGraph } from "../graph/model.ts";
import { type Group, partitionOf } from "../planning/state.ts";
import { groupsOf } from "./assign.ts";

const workOf = async (source: string): Promise<WorkGraph> =>
  buildWorkGraph(await extractGraph(source), {
    direction: "TB",
    rows: 0,
    measured: { nodes: 0, edges: 0, subgraphs: 0, depth: 0 },
  });

const group = (
  members: string[],
  extra: Partial<Group> & Pick<Group, "tier" | "reason">,
): Group => ({ members, regions: [], parent: null, ...extra });

const labelsOf = async (
  source: string,
  groups: Group[],
): Promise<Array<[string, string, string]>> =>
  groupsOf(await workOf(source), partitionOf(groups)).map((g) => [
    g.id,
    g.label,
    g.labelBase,
  ]);

const NESTED = [
  "flowchart TB",
  "subgraph east[East]",
  "subgraph ew[Web]",
  "A1-->A2",
  "end",
  "end",
  "subgraph west[West]",
  "subgraph ww[Web]",
  "B1-->B2",
  "end",
  "end",
  "A2-->B1",
].join("\n");

test("regions of one label read apart by the region around them", async () => {
  assert.deepEqual(
    await labelsOf(NESTED, [
      group(["A1", "A2"], {
        regions: ["ew"],
        parent: "east",
        tier: "T1",
        reason: "region",
      }),
      group(["B1", "B2"], {
        regions: ["ww"],
        parent: "west",
        tier: "T1",
        reason: "region",
      }),
    ]),
    [
      ["g1", "Web (East) (+2)", "Web (East)"],
      ["g2", "Web (West) (+2)", "Web (West)"],
    ],
  );
});

test("a region no other group echoes takes its own label first", async () => {
  assert.deepEqual(
    await labelsOf(NESTED, [
      group(["A1", "A2"], {
        regions: ["ew"],
        parent: "east",
        tier: "T1",
        reason: "region",
      }),
    ]),
    [["g1", "Web (+2)", "Web"]],
  );
});

const FAN = [
  "flowchart TB",
  "U[Upstream]-->S[Order service]",
  'S-->A["Quote API, EU"]',
  'S-->B["Rates feed, ECB"]',
  'S-->C["Payment API, card"]',
].join("\n");

test("leaves hanging from one node are named after that node", async () => {
  assert.deepEqual(
    await labelsOf(FAN, [
      group(["A", "B", "C"], { tier: "T5", reason: "community" }),
    ]),
    [["g1", "Order service → … (+3)", "Order service → …"]],
  );
});

test("leaves hanging from a group take the name that group shows", async () => {
  // A chain-like group is named after its entry, so the leaves read from Upstream.
  assert.deepEqual(
    await labelsOf(FAN, [
      group(["A", "B", "C"], { tier: "T5", reason: "community" }),
      group(["S", "U"], { tier: "T4", reason: "aggregate" }),
    ]),
    [
      ["g1", "Upstream → … (+3)", "Upstream → …"],
      ["g2", "Upstream (+Order service)", "Upstream"],
    ],
  );
});
