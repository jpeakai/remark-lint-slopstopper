import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { calculateComplexity, configFromPreset } from "../complexity/metrics.ts";
import { extractStats } from "../parsing/statistics.ts";
import { type SplitPlan, splitOutcome } from "./index.ts";

const document = readFileSync(new URL("../../../examples/multiple-diagrams.md", import.meta.url), "utf8");
const [architecture, decisions] = [...document.matchAll(/^```mermaid\n([\s\S]*?)\n```/gm)].map((m) => m[1]);

// Independent expected values from the upstream summarisation page and its
// generated presets.md/decisions-presets.md snippets, rather than our planner.
interface Fixture {
  name: string;
  source: string;
  nodes: number;
  edges: number;
  groups: number;
  score: number;
  plans: [string, string, number, number, number][];
}

const expected: Fixture[] = [
  {
    name: "shop",
    source: architecture,
    nodes: 29,
    edges: 32,
    groups: 4,
    score: 62.7,
    plans: [
      ["low-density", "T5", 8, 12.5, 6],
      ["medium-density", "T5", 9, 14, 6],
      ["high-density", "T3", 21, 32.5, 4],
    ],
  },
  {
    name: "underwriting",
    source: decisions,
    nodes: 41,
    edges: 48,
    groups: 0,
    score: 65,
    plans: [
      ["low-density", "T5", 10, 15, 7],
      ["medium-density", "T2", 10, 14.5, 7],
      ["high-density", "T2", 16, 24, 5],
    ],
  },
];

for (const fixture of expected) {
  test(`${fixture.name} score matches the realistic upstream worked example`, async () => {
    const stats = await extractStats(fixture.source);

    assert.equal(stats.error, null);
    assert.deepEqual([stats.nodes, stats.edges, stats.subgraphs], [fixture.nodes, fixture.edges, fixture.groups]);
    assert.equal(calculateComplexity(stats, configFromPreset("high-density")).visual_complexity_score, fixture.score);
  });

  for (const [preset, tier, nodes, score, details] of fixture.plans) {
    test(`${fixture.name} ${preset} matches the documented contract-verified split`, async () => {
      const config = configFromPreset(preset);

      const outcome = await splitOutcome(fixture.source, config);

      assert.deepEqual(outcome.violations, []);
      assert.ok(outcome.plan, outcome.reason);

      const plan = outcome.plan;

      assert.deepEqual(
        [plan.tier, plan.overviewNodes, plan.overviewScore, plan.details.length],
        [tier, nodes, score, details],
      );
      assert.equal(plan.loss.newReachablePairs, 0);

      // Validate emitted source with the official parser independently of its
      // reported counts, including nested detail overviews when present.
      const check = async (current: SplitPlan): Promise<void> => {
        const overview = await extractStats(current.overviewSource);

        assert.equal(overview.error, null);
        assert.ok(overview.nodes <= config.node_target);
        assert.ok(calculateComplexity(overview, config).visual_complexity_score <= config.vcs_target);

        for (const detail of current.details) {
          const parsed = await extractStats(detail.source);

          assert.equal(parsed.error, null);

          if (detail.split) {
            await check(detail.split);
          } else {
            assert.ok(parsed.nodes <= config.node_target);
            assert.ok(calculateComplexity(parsed, config).visual_complexity_score <= config.vcs_target);
          }
        }
      };

      await check(plan);
    });
  }
}
