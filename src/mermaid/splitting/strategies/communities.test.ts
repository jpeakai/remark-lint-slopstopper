import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import { extractGraph } from "../../parsing/graph.ts";
import { extractStats } from "../../parsing/statistics.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { directionOf, measuredOf, splitOutcome } from "../index.ts";
import type { Candidate } from "../planning/candidates.ts";
import { type FoldRules, LOOSE, STRICT } from "../planning/constraints.ts";
import { EMPTY_PARTITION } from "../planning/state.ts";
import { quotientEdges } from "../projection/quotient.ts";
import { communities, ID_FAMILY, ID_FAMILY_KIN } from "./communities.ts";

// The T6 candidates of a diagram with nothing folded yet.
const candidatesOf = async (
  source: string,
  rules: FoldRules = STRICT,
): Promise<Candidate[]> => {
  const stats = await extractStats(source);
  const work = buildWorkGraph(await extractGraph(source), {
    direction: await directionOf(source),
    rows: stats.rows,
    measured: measuredOf(stats),
  });
  return communities({
    work,
    part: EMPTY_PARTITION,
    config: configFromPreset("low-density"),
    qedges: quotientEdges(work, EMPTY_PARTITION),
    rules,
  });
};

const near = (actual: number | undefined, expected: number): void =>
  assert.ok(
    actual !== undefined && Math.abs(actual - expected) < 1e-9,
    `${actual} is not ${expected}`,
  );

const find = (cs: Candidate[], keys: string[]): Candidate => {
  const found = cs.find((c) => c.keys.join() === keys.join());
  assert.ok(found, `no candidate for ${keys.join()}`);
  return found;
};

// Twelve nodes in a ring with four chords: degrees 3 at chord ends, else 2.
const RING = [
  "flowchart LR",
  "  A --> B",
  "  B --> C",
  "  C --> D",
  "  D --> E",
  "  E --> F",
  "  F --> G",
  "  G --> H",
  "  H --> I",
  "  I --> J",
  "  J --> K",
  "  K --> L",
  "  L --> A",
  "  A --> G",
  "  C --> J",
  "  E --> L",
  "  B --> H",
].join("\n");

test("every joined pair is proposed, ranked by modularity gain", async () => {
  const cs = await candidatesOf(RING);
  assert.equal(cs.length, 16);
  assert.ok(cs.every((c) => c.reason === "suggested grouping"));
  assert.ok(cs.every((c) => c.tier === "T6" && c.parent === null));
  // Gain 1/m - deg(a)deg(b)/(2m^2), m = 16 edges.
  near(find(cs, ["A", "B"]).priority, 1 / 16 - 9 / 512);
  near(find(cs, ["C", "D"]).priority, 1 / 16 - 6 / 512);
  assert.equal(
    cs.some((c) => c.keys.join() === "A,C"),
    false,
  );
});

test("a ring with chords is planned with a suggested grouping", async () => {
  const outcome = await splitOutcome(RING, configFromPreset("low-density"));
  assert.deepEqual(outcome.violations, []);
  assert.ok(outcome.plan, outcome.reason);
  assert.equal(outcome.plan.tier, "T6");
  assert.deepEqual(
    outcome.plan.groups.map((g) => [g.reason, g.members]),
    [["suggested grouping", ["B", "C", "D"]]],
  );
});

// Two four-node cliques bridged twice: 14 of 28 pairs joined.
const CLIQUES = [
  "flowchart LR",
  "  A --- B",
  "  A --- C",
  "  A --- D",
  "  B --- C",
  "  B --- D",
  "  C --- D",
  "  E --- F",
  "  E --- G",
  "  E --- H",
  "  F --- G",
  "  F --- H",
  "  G --- H",
  "  D --- E",
  "  A --- H",
].join("\n");

test("a dense overview proposes each tight clique with its summed gain", async () => {
  const cs = await candidatesOf(CLIQUES, LOOSE);
  const cliques = cs.filter((c) => c.reason === "tight clique");
  assert.deepEqual(
    cliques.map((c) => c.keys),
    [
      ["A", "B", "C", "D"],
      ["E", "F", "G", "H"],
    ],
  );
  // m = 14; degrees A 4, B 3, C 3, D 4: six pair gains summed.
  near(cliques[0]?.priority, 6 / 14 - 73 / 392);
  near(find(cs, ["B", "C"]).priority, 1 / 14 - 9 / 392);
});

test("hubs stay in view, so strict rules propose no clique", async () => {
  const cs = await candidatesOf(CLIQUES);
  assert.deepEqual(
    cs.map((c) => c.keys),
    [
      ["B", "C"],
      ["F", "G"],
    ],
  );
});

const PIPELINE = [
  "flowchart LR",
  "  Q[quality suite] --> SP[silver.payments]",
  "  Q --> SS[silver.sessions]",
  "  SP --> GR[gold.revenue]",
  "  SS --> GE[gold.engagement]",
  "  BP[bronze.payments] --> Q",
  "  BS[bronze.sessions] --> Q",
  "  GR --> DASH[dashboard]",
  "  GE --> DASH",
].join("\n");

test("one stage fed by a shared neighbour pairs with no edge between", async () => {
  const cs = await candidatesOf(PIPELINE);
  const stage = find(cs, ["SP", "SS"]);
  assert.equal(stage.kin, 1);
  // Their neighbours Q, GR and GE: only Q is shared.
  near(stage.align, 1 / 3);
  // Both bronze tables feed only Q, so every neighbour is shared.
  assert.equal(find(cs, ["BP", "BS"]).align, 1);
  assert.equal(find(cs, ["DASH", "GE"]).kin, 0);
  assert.equal(find(cs, ["DASH", "GE"]).align, 0);
});

test("prefix families stay apart under strict rules", async () => {
  const cs = await candidatesOf(PIPELINE);
  assert.equal(
    cs.some((c) => c.keys.join() === "GR,SP"),
    false,
  );
});

test("a pair mixing two stages loses a tie once families may mix", async () => {
  const cs = await candidatesOf(PIPELINE, { ...STRICT, keepFamilies: false });
  assert.equal(find(cs, ["GR", "SP"]).tie, -1);
  assert.equal(find(cs, ["DASH", "GR"]).tie, 0);
});

const TICKETS = [
  "flowchart LR",
  "  P1[PLAT-1201 Auth] --> P2[PLAT-1202 Tokens]",
  "  P2 --> P3[PLAT-1203 Sessions]",
  "  P3 --> P4[PLAT-1204 Logout]",
  "  D1[DATA-0381 Ingest] --> D2[DATA-0382 Clean]",
  "  D2 --> D3[DATA-0383 Model]",
  "  D3 --> D4[DATA-0384 Report]",
  "  P2 --> D2",
  "  P4 --> D4",
  "  O1[OPS-0011 Deploy] --> O2[OPS-0012 Monitor]",
  "  O2 --> O3[OPS-0013 Alert]",
  "  P3 --> O1",
  "  D3 --> O2",
].join("\n");

test("a ticket graph folds each id family whole, before any pair", async () => {
  const cs = await candidatesOf(TICKETS);
  const families = cs.filter((c) => c.reason === ID_FAMILY);
  assert.deepEqual(
    families.map((c) => c.keys),
    [
      ["D1", "D2", "D3", "D4"],
      ["O1", "O2", "O3"],
      ["P1", "P2", "P3", "P4"],
    ],
  );
  assert.ok(families.every((c) => c.kin === ID_FAMILY_KIN));
  // A pair of one family shares a stem in its labels' ids.
  assert.equal(find(cs, ["D1", "D2"]).kin, 1);
});

const BIG_FAMILY = [
  "flowchart LR",
  ...Array.from(
    { length: 14 },
    (_, i) =>
      `  P${i + 10}[PLAT-12${i + 10} Step] --> P${i + 11}[PLAT-12${i + 11} Step]`,
  ),
  "  D1[DATA-0381 Ingest] --> D2[DATA-0382 Clean]",
  "  P12 --> D1",
  "  X1[OPS-0011 Deploy]",
  "  Y1[OPS-0012 Monitor]",
  "  D2 --> X1",
  "  D1 --> Y1",
].join("\n");

test("a family too large for one detail folds as even contiguous runs", async () => {
  const cs = await candidatesOf(BIG_FAMILY);
  const families = cs.filter((c) => c.reason === ID_FAMILY);
  assert.deepEqual(
    families.map((c) => [c.keys, (c.also ?? []).map((a) => a.keys)]),
    [
      [["D1", "D2"], []],
      [
        ["P10", "P11", "P12", "P13", "P14", "P15", "P16", "P17"],
        [["P18", "P19", "P20", "P21", "P22", "P23", "P24"]],
      ],
    ],
  );
});

test("a family whose members no edge joins is not folded", async () => {
  const cs = await candidatesOf(BIG_FAMILY);
  assert.equal(
    cs.some((c) => c.reason === ID_FAMILY && c.keys.includes("X1")),
    false,
  );
});

test("a diagram with a label leading with no id has no id families", async () => {
  const cs = await candidatesOf(`${TICKETS}\n  O3 --> Done`);
  assert.equal(
    cs.some((c) => c.reason === ID_FAMILY),
    false,
  );
});

test("an erDiagram never folds by id family", async () => {
  const cs = await candidatesOf(
    [
      "erDiagram",
      '  PLAT-1201 ||--o{ PLAT-1202 : "has"',
      '  PLAT-1202 ||--o{ PLAT-1203 : "has"',
    ].join("\n"),
  );
  assert.equal(
    cs.some((c) => c.reason === ID_FAMILY),
    false,
  );
});
