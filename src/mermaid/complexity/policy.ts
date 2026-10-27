import type { RuleOptions } from "../../types.ts";
import type { DiagramStats } from "../parsing/statistics.ts";
import type { Report } from "../report.ts";
import { type SplitOutcome, type SplitPlan, splitOutcome } from "../splitting/index.ts";
import { calculateComplexity, type ThresholdConfig, thresholdsFrom } from "./metrics.ts";

export const COMPLEXITY_RULE = "mermaid/complexity-visual-score-acceptable-exceeded";

export async function reportComplexity(
  source: string,
  stats: DiagramStats,
  options: RuleOptions,
  report: Report,
): Promise<void> {
  const config = thresholdsFrom(options.complexity ?? options);
  const metrics = calculateComplexity(stats, config);

  if (metrics.visual_complexity_score <= config.vcs_acceptable) {
    return;
  }

  const outcome = await splitOutcome(source, config);

  report(
    COMPLEXITY_RULE,
    `VCS ${metrics.visual_complexity_score} exceeds ${config.vcs_acceptable} (${config.preset_name}). Formula: (${stats.nodes} nodes + ${stats.edges} edges × ${config.edge_weight} + ${stats.rows} rows × ${config.row_weight} + ${stats.subgraphs} subgraphs × ${config.subgraph_weight}) × (1 + ${Math.max(stats.max_tree_depth, stats.max_subgraph_depth)} depth × ${config.depth_weight}). ${recommendation(outcome, config)}`,
  );
}

function planDetails(plan: SplitPlan): string[] {
  return plan.details.flatMap((detail) =>
    detail.split
      ? [`Detail ${detail.group}: ${planTradeoffs(detail.split)}`, ...planDetails(detail.split)]
      : [`Detail ${detail.group}:\n${detail.source}`],
  );
}

function planTradeoffs(plan: SplitPlan): string {
  const loss = plan.loss;
  const ladder = plan.ladder
    .map(
      (step) =>
        `${step.tier}: ${step.nodes} nodes, VCS ${step.score}, ${loss.byTier[step.tier] ?? "unreported"} additional reachable pairs`,
    )
    .join(" → ");

  return `Overview trade-offs: ${loss.newReachablePairs} additional reachable node pairs implied by folding, ${loss.droppedRows} dropped attribute/member rows, ${loss.mergedMarkers} merged start/end transitions, ${loss.reversedEdges} reversed undirected overview edges. Details retain the original transitions and edge direction. Ladder: ${ladder}.`;
}

function recommendation(outcome: SplitOutcome, config: ThresholdConfig): string {
  const plan = outcome.plan;

  if (plan) {
    return `Split-plan recommendation (${plan.tier}, contract verified): ${plan.flagged}. ${planTradeoffs(plan)} Preserve every original node and relationship across this overview and its details. Overview:\n${plan.overviewSource}\n${planDetails(plan).join("\n")}\n${plan.rowDetails.map((row) => `Rows ${row.members.join(", ")}:\n${row.source}`).join("\n")}`;
  }

  const violations = outcome.violations.length ? ` Contract violations: ${outcome.violations.join("; ")}.` : "";
  const next = outcome.alternative
    ? ` Use this ${outcome.alternative.kind}:\n${outcome.alternative.markdown}`
    : ` Target at most ${config.node_target} nodes and VCS ${config.vcs_target} per view.`;

  return `Split-plan recommendation: ${outcome.reason}.${violations}${next}`;
}
