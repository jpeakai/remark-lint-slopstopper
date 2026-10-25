import type { ThresholdConfig } from "../../complexity/metrics.ts";
import type { WorkGraph } from "../graph/model.ts";
import { newReachablePairs } from "../graph/reachability.ts";
import { groupsOf } from "../labels/assign.ts";
import type { LabelContext } from "../labels/context.ts";
import {
  type Build,
  type Folded,
  keyOf,
  type LadderStep,
  type Partition,
  partFromGroups,
  type RowDetail,
  type SplitDetail,
  type SplitDetailFn,
  type SplitGroup,
  type SplitPlan,
  type Tier,
} from "../planning/state.ts";
import { detailShape, detailView } from "../projection/detail.ts";
import {
  ladderOf,
  meets,
  overviewShape,
  quotientEdges,
  reversedEdges,
  scoreOf,
} from "../projection/quotient.ts";
import { buildDetail, rowCount, rowDetailsOf } from "./detail.ts";
import { overviewGraph, overviewMarkers } from "./graphs.ts";
import { emitSource } from "./serialize.ts";

const drawnRows = (
  work: WorkGraph,
  details: SplitDetail[],
  rowDetails: RowDetail[],
): number =>
  details.reduce(
    (sum, d) =>
      sum +
      (d.rows
        ? rowCount(
            work,
            d.graph.nodes.map((n) => n.id),
          )
        : 0),
    0,
  ) + rowDetails.reduce((sum, d) => sum + rowCount(work, d.members), 0);

const lossOf = (
  work: WorkGraph,
  folded: Folded,
  drawn: number,
): SplitPlan["loss"] => {
  const byTier: Partial<Record<Tier, number>> = {};
  for (const s of folded.snapshots)
    byTier[s.tier] = newReachablePairs(work, partFromGroups(s.groups));
  return {
    newReachablePairs: newReachablePairs(work, folded.part),
    byTier,
    droppedRows: work.rows - drawn,
    mergedMarkers:
      work.family === "state" ? overviewMarkers(work, folded.part).merged : 0,
    reversedEdges: reversedEdges(work, folded.part),
  };
};

const labelContext = (
  work: WorkGraph,
  part: Partition,
  groups: SplitGroup[],
): LabelContext => ({
  work,
  part,
  groups: new Map(
    part.groups.map((g, i) => {
      const s = groups[i] as SplitGroup;
      return [
        keyOf(g),
        {
          id: s.id,
          base: s.labelBase,
          label: s.label,
          ...(s.markdown ? { markdown: s.markdown } : {}),
          ...(s.paired !== undefined ? { paired: true as const } : {}),
          ...(s.spanned ? { spanned: true as const } : {}),
        },
      ];
    }),
  ),
});

// The groups whose details exceed the target and therefore need another split.
const splitAgain = (
  work: WorkGraph,
  part: Partition,
  config: ThresholdConfig,
): Set<string> =>
  new Set(
    part.groups
      .filter((g) => {
        const shape = detailShape(work, detailView(work, part, g));
        return !meets(shape.nodes, scoreOf(shape, 0, config), config);
      })
      .map(keyOf),
  );

export const assemble = (
  folded: Folded,
  config: ThresholdConfig,
  split: SplitDetailFn,
): Build | string => {
  const { work, part } = folded;
  const groups = groupsOf(work, part);
  const { graph: overview, covers } = overviewGraph(work, part, groups);
  const nested = splitAgain(work, part, config);
  const a = {
    folded,
    config,
    split,
    labels: labelContext(work, part, groups),
    nested,
  };
  const details: SplitDetail[] = [];
  const builds: Record<string, Build> = {};
  for (const g of groups) {
    const built = buildDetail(a, g);
    if (typeof built === "string") return built;
    details.push(built.detail);
    if (built.nested) builds[g.id] = built.nested;
  }
  const rowDetails = rowDetailsOf(work, part, config);
  const shape = overviewShape(work, part, quotientEdges(work, part));
  const ladder = ladderOf(work, folded.snapshots, config);
  const stubs = new Set(
    overview.nodes.filter((n) => work.stubs.has(n.id)).map((n) => n.id),
  );
  const plan: SplitPlan = {
    diagram_type: work.type,
    tier: folded.tier,
    flagged: flaggedText(work, config, ladder, folded.tier),
    groups,
    overview,
    overviewSource: emitSource(work, {
      graph: overview,
      stubs,
      groups: new Set(groups.map((g) => g.id)),
    }),
    overviewNodes: shape.nodes,
    overviewScore: scoreOf(shape, 0, config),
    details,
    rowDetails,
    loss: lossOf(work, folded, drawnRows(work, details, rowDetails)),
    ladder,
  };
  return { plan, work, covers, snapshots: folded.snapshots, nested: builds };
};

// Why a plan was offered, in words a reader checks against the target: the
// size the complexity rules measured the diagram at, the split target, and
// which of the two measures is over (SLOP-0035). A diagram over on its score
// alone may be over only for the rows it draws; its plan then says so, and
// that dropping the rows from the overview meets the target. Nothing folds
// then, or only closed aggregates, which the plan says (SLOP-0035).

const overOn = (nodes: boolean, score: boolean): string =>
  nodes && score
    ? "over on both"
    : nodes
      ? "over on its node count alone"
      : "over on its score alone";

// What folds once rows dropped meet the target: nothing at T1, else only the
// aggregates whose other members relate to nothing outside them.
const ROWS_ONLY_FOLDS: Partial<Record<Tier, string>> = {
  T1: "so no node folds",
  T4: "so only aggregates whose other members relate to nothing else fold",
};

export const flaggedText = (
  work: WorkGraph,
  config: ThresholdConfig,
  ladder: readonly LadderStep[],
  tier: Tier,
): string => {
  const { nodes } = work.measured;
  const score = scoreOf(work.measured, work.rows, config);
  const [nt, vt] = [config.node_target, config.vcs_target];
  const lead = `flagged at ${nodes} nodes and a score of ${score}, against a split target of ${nt} nodes and ${vt}: ${overOn(nodes > nt, score > vt)}`;
  const rowsOnly = ladder[0];
  const folds = ROWS_ONLY_FOLDS[tier];
  if (work.rows === 0 || rowsOnly === undefined || folds === undefined)
    return lead;
  if (!meets(rowsOnly.nodes, rowsOnly.score, config)) return lead;
  return `${lead}. Its rows move to row diagrams, and the overview without them meets the target at ${rowsOnly.nodes} nodes and ${rowsOnly.score}, ${folds}`;
};
