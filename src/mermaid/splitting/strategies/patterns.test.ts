import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import { extractGraph } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { directionOf, measuredOf } from "../index.ts";
import type { Candidate, LaneSearch } from "../planning/candidates.ts";
import { STRICT } from "../planning/constraints.ts";
import {
  membersOfKey,
  type Partition,
  partitionOf,
} from "../planning/state.ts";
import { quotientEdges } from "../projection/quotient.ts";
import { MIN_LANES, structuralPatterns } from "./patterns.ts";

interface Proposal {
  candidates: Candidate[];
  lanes: LaneSearch;
  part: Partition;
}

// The T2 candidates of a diagram, with the given chains already folded as
// chain stages, on a walk of the given lane mode.
const propose = async (
  source: string,
  mode: LaneSearch["mode"],
  chains: string[][] = [],
): Promise<Proposal> => {
  const stats = await extractStats(source);
  const work = buildWorkGraph(await extractGraph(source), {
    direction: await directionOf(source),
    rows: stats.rows,
    measured: measuredOf(stats),
  });
  const part = partitionOf(
    chains.map((members) => ({
      members,
      regions: [],
      parent: null,
      tier: "T2",
      reason: "chain stage",
    })),
  );
  const lanes: LaneSearch = { mode, encountered: false };
  const candidates = structuralPatterns({
    work,
    part,
    config: configFromPreset("low-density"),
    qedges: quotientEdges(work, part),
    rules: STRICT,
    lanes,
  });
  return { candidates, lanes, part };
};

// Each candidate's step: its own members, then those of every merge it carries.
const steps = (p: Proposal): Array<[string, string[]]> =>
  p.candidates.flatMap((c) =>
    [c, ...(c.also ?? [])].map((m): [string, string[]] => [
      m.reason,
      m.keys.flatMap((k) => membersOfKey(p.part, k)).sort(),
    ]),
  );

// Lanes from S to T, each an extract then a load, numbered from `from`.
const lanes = (
  from: number,
  count: number,
  first = "extract",
  second = "load",
) =>
  Array.from({ length: count }, (_, i) => {
    const n = from + i;
    return [
      `  S --> A${n}[${first} t${n}]`,
      `  A${n} --> B${n}[${second} t${n}]`,
      `  B${n} --> T`,
    ].join("\n");
  });

const diagram = (...parts: string[][]): string =>
  ["flowchart LR", ...parts.flat()].join("\n");

test("twin lanes too many for one detail fold in even runs of lanes", async () => {
  const p = await propose(diagram(lanes(1, 8)), "whole");
  assert.deepEqual(steps(p), [
    ["twins", ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]],
    ["twins", ["A5", "A6", "A7", "A8", "B5", "B6", "B7", "B8"]],
  ]);
});

test("twin lanes fold by the stage words their labels name", async () => {
  const p = await propose(
    diagram(lanes(1, 3), lanes(4, 4, "fetch", "store")),
    "whole",
  );
  assert.deepEqual(steps(p), [
    ["twins", ["A1", "A2", "A3", "B1", "B2", "B3"]],
    ["twins", ["A4", "A5", "A6", "A7", "B4", "B5", "B6", "B7"]],
  ]);
});

test("a lane alone in its stage words folds as its own chain stage", async () => {
  const p = await propose(
    diagram(lanes(1, 4), lanes(5, 1, "fetch", "store")),
    "whole",
  );
  assert.equal(MIN_LANES, 2);
  assert.deepEqual(steps(p), [
    ["twins", ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"]],
    ["chain stage", ["A5", "B5"]],
  ]);
});

test("twin lanes that fit together fold lane by lane", async () => {
  const p = await propose(diagram(lanes(1, 3)), "whole");
  assert.deepEqual(steps(p), [
    ["chain stage", ["A1", "B1"]],
    ["chain stage", ["A2", "B2"]],
    ["chain stage", ["A3", "B3"]],
  ]);
});

test("off a whole-lane walk, each chain folds as its own step", async () => {
  const p = await propose(diagram(lanes(1, 2)), "staged");
  assert.deepEqual(
    p.candidates.map((c) => [c.keys, c.also?.length ?? 0]),
    [
      [["A1", "B1"], 0],
      [["A2", "B2"], 0],
    ],
  );
});

const FOLDED = [
  ["A1", "B1"],
  ["A2", "B2"],
  ["A3", "B3"],
];

test("folded twin chains fold whole and split again on a nested walk", async () => {
  const p = await propose(diagram(lanes(1, 3)), "nested", FOLDED);
  assert.deepEqual(steps(p), [["twins", ["A1", "A2", "A3", "B1", "B2", "B3"]]]);
  assert.equal(p.candidates[0]?.splits, true);
  assert.equal(p.lanes.encountered, true);
});

test("folded twin chains fold whole when their detail fits", async () => {
  const p = await propose(diagram(lanes(1, 3)), "whole", FOLDED);
  assert.deepEqual(steps(p), [["twins", ["A1", "A2", "A3", "B1", "B2", "B3"]]]);
  assert.equal(p.candidates[0]?.splits, undefined);
  assert.equal(p.lanes.encountered, true);
});

test("folded twin chains too large for one detail are not folded whole", async () => {
  const eight = Array.from({ length: 8 }, (_, i) => [`A${i + 1}`, `B${i + 1}`]);
  const p = await propose(diagram(lanes(1, 8)), "whole", eight);
  assert.deepEqual(steps(p), []);
  assert.equal(p.lanes.encountered, true);
});

test("folded twin chains on a staged walk fold as plain twins", async () => {
  const p = await propose(diagram(lanes(1, 3)), "staged", FOLDED);
  assert.deepEqual(steps(p), [["twins", ["A1", "A2", "A3", "B1", "B2", "B3"]]]);
  assert.equal(p.lanes.encountered, false);
});
