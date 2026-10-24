import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateComplexity,
  configFromPreset,
  type ThresholdConfig,
} from "../../complexity/metrics.ts";
import { extractGraph } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph, type WorkGraph } from "../graph/model.ts";
import { directionOf, measuredOf, splitOutcome } from "../index.ts";
import { EVEN_SHARE, laddersOf, MAX_DEPTH } from "./search.ts";
import type { SplitPlan } from "./state.ts";

const LOW = configFromPreset("low-density");
const MEDIUM = configFromPreset("medium-density");

const workOf = async (source: string): Promise<WorkGraph> => {
  const stats = await extractStats(source);
  return buildWorkGraph(await extractGraph(source), {
    direction: await directionOf(source),
    rows: stats.rows,
    measured: measuredOf(stats),
  });
};

const planOf = async (
  source: string,
  config: ThresholdConfig,
): Promise<SplitPlan> => {
  const outcome = await splitOutcome(source, config);
  assert.deepEqual(outcome.violations, []);
  assert.ok(outcome.plan, outcome.reason);
  return outcome.plan;
};

// The node count and score of emitted Mermaid, read back by the parser.
const measure = async (
  source: string,
  config: ThresholdConfig,
): Promise<[number, number]> => {
  const stats = await extractStats(source);
  assert.equal(stats.error, null);
  return [
    stats.nodes,
    calculateComplexity(stats, config).visual_complexity_score,
  ];
};

const meetsTarget = async (
  source: string,
  config: ThresholdConfig,
): Promise<number> => {
  const [nodes, score] = await measure(source, config);
  assert.ok(nodes <= config.node_target, `${nodes} nodes`);
  assert.ok(score <= config.vcs_target, `score ${score}`);
  return nodes;
};

test("a detail may split once more, and evening keeps three fifths", () => {
  assert.equal(MAX_DEPTH, 2);
  assert.equal(EVEN_SHARE, 0.6);
});

test("a diagram with author regions walks regions first, then the default", async () => {
  const flat = await workOf("flowchart LR\n  A --> B");
  const boxed = await workOf(
    "flowchart LR\n  subgraph box\n    A --> B\n  end\n  B --> C",
  );
  assert.equal(laddersOf(flat).length, 1);
  assert.equal(laddersOf(boxed).length, 2);
  assert.equal(laddersOf(boxed)[1], laddersOf(flat)[0]);
});

// Eight entities over the target by their attribute rows alone. Only ORDER
// owns entities, LINE and PAYMENT, which relate to nothing else, and ORDER's
// one outside relationship is to CUSTOMER: a closed aggregate. The many-to-
// many relationships among the rest form three independent cycles.
const ENTITIES = [
  "CUSTOMER",
  "ORDER",
  "ADDRESS",
  "REVIEW",
  "LINE",
  "PAYMENT",
  "PRODUCT",
  "STORE",
];
const SHOP = [
  "erDiagram",
  "  CUSTOMER }o--o{ ORDER : places",
  "  CUSTOMER }o--o{ ADDRESS : has",
  "  CUSTOMER }o--o{ REVIEW : writes",
  "  PRODUCT }o--o{ REVIEW : gets",
  "  STORE }o--o{ PRODUCT : sells",
  "  STORE }o--o{ CUSTOMER : serves",
  "  STORE }o--o{ ADDRESS : at",
  "  PRODUCT }o--o{ ADDRESS : ships",
  "  ORDER ||--|{ LINE : contains",
  "  ORDER ||--|{ PAYMENT : settles",
  ...ENTITIES.flatMap((e) => [
    `  ${e} {`,
    ...["id", "created", "updated", "owner", "status", "note"].map(
      (a) => `    string ${a}`,
    ),
    "  }",
  ]),
].join("\n");

test("an erDiagram over its target by rows folds its closed aggregate", async () => {
  const plan = await planOf(SHOP, LOW);
  assert.equal(plan.tier, "T4");
  assert.deepEqual(
    plan.groups.map((g) => [g.reason, g.members]),
    [["aggregate root", ["LINE", "ORDER", "PAYMENT"]]],
  );
  // Eight entities, three folded into one.
  assert.equal(await meetsTarget(plan.overviewSource, LOW), 6);
  assert.equal(plan.details.length, 1);
});

const smallRegion = (s: string): string[] => [
  `  subgraph r${s} [small ${s}]`,
  `    ${s}1 --> ${s}2`,
  `    ${s}2 --> ${s}3`,
  `    ${s}1 --> ${s}3`,
  `    ${s}3 --> ${s}4`,
  `    ${s}2 --> ${s}4`,
  "  end",
];

// Two regions of four, one of sixteen and three free nodes: 27 in all.
const OVERSHOOT = [
  "flowchart LR",
  ...smallRegion("a"),
  ...smallRegion("d"),
  "  subgraph rb [big]",
  ...Array.from({ length: 15 }, (_, i) => `    b${i + 1} --> b${i + 2}`),
  "    b1 --> b8",
  "    b4 --> b12",
  "  end",
  "  c1 --> c2",
  "  c2 --> c3",
  "  c1 --> c3",
  "  a4 --> b1",
  "  b16 --> c1",
  "  c3 --> d1",
  "  d4 --> a1",
].join("\n");

test("an overview folded below three fifths of its target gives a region back", async () => {
  const plan = await planOf(OVERSHOOT, MEDIUM);
  const folded = plan.groups.map((g) => g.members.length).sort((a, b) => a - b);
  // All three regions folded leave 6 nodes, under ceil(0.6 * 15) = 9; giving
  // back one small region leaves 9.
  assert.deepEqual(folded, [4, 16]);
  assert.equal(await meetsTarget(plan.overviewSource, MEDIUM), 9);
});

// A region of crossing pairs, p(i) to q(i) and q(i + 1), between two short
// flows: in2 enters at p1 and out1 leaves from q12, and in1 reaches out2.
const CROWN = [
  "flowchart LR",
  "  subgraph box [inner]",
  ...Array.from({ length: 12 }, (_, k) => {
    const i = k + 1;
    return [
      `    p${i} --> q${i}`,
      ...(i < 12 ? [`    p${i} --> q${i + 1}`] : []),
    ].join("\n");
  }),
  "  end",
  "  in1 --> in2",
  "  in2 --> p1",
  "  q12 --> out1",
  "  out1 --> out2",
  "  in1 --> out2",
].join("\n");

test("a region too large for its detail folds whole and splits again", async () => {
  const plan = await planOf(CROWN, MEDIUM);
  assert.equal(plan.tier, "T3");
  assert.deepEqual(
    plan.groups.map((g) => [g.reason, g.members.length]),
    [["author region", 24]],
  );
  assert.equal(await meetsTarget(plan.overviewSource, MEDIUM), 5);
  // p1 reaches only q1 and q2, so the folded box newly joins in1 and in2 to
  // out1, and in2 to out2.
  assert.equal(plan.loss.newReachablePairs, 3);
  const [detail] = plan.details;
  assert.ok(detail?.split, "the region's detail is split again");
  await meetsTarget(detail.split.overviewSource, MEDIUM);
  for (const nested of detail.split.details)
    await meetsTarget(nested.source, MEDIUM);
});
