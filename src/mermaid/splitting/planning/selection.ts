import type { WorkGraph } from "../graph/model.ts";
import { byNaturalTuple, byText } from "../graph/order.ts";
import { newReachablePairs } from "../graph/reachability.ts";
import {
  foldedParallels,
  overviewShape,
  type QEdge,
  quotientEdges,
  type Shape,
  scoreOf,
} from "../projection/quotient.ts";
import { communities } from "../strategies/communities.ts";
import { entityAggregates } from "../strategies/entities.ts";
import { leafBundles } from "../strategies/leaves.ts";
import { structuralPatterns } from "../strategies/patterns.ts";
import { authorRegions } from "../strategies/regions.ts";
import {
  type Candidate,
  type CandidateContext,
  detailFits,
  type LaneSearch,
  mergedGroup,
} from "./candidates.ts";
import {
  type Group,
  isGroupKey,
  type Merge,
  merge,
  type Partition,
  type Tier,
} from "./state.ts";

// Serialized tier ids remain part of the plan contract; strategy names describe behavior.
type Ranking = "density" | "modularity" | "edges" | "balanced";
export interface Strategy {
  tier: Tier;
  propose: (ctx: CandidateContext) => Candidate[];
  ranking: Ranking;
  recursiveDetails?: true;
}
const PATTERNS: Strategy = {
  tier: "T2",
  propose: structuralPatterns,
  ranking: "density",
};
const REGIONS: Strategy = {
  tier: "T3",
  propose: authorRegions,
  ranking: "density",
  recursiveDetails: true,
};
export const AGGREGATES: Strategy = {
  tier: "T4",
  propose: entityAggregates,
  ranking: "edges",
  recursiveDetails: true,
};
const LEAVES: Strategy = {
  tier: "T5",
  propose: leafBundles,
  ranking: "balanced",
};
const COMMUNITIES: Strategy = {
  tier: "T6",
  propose: communities,
  ranking: "modularity",
};
export const DEFAULT_STRATEGIES = [
  PATTERNS,
  REGIONS,
  AGGREGATES,
  LEAVES,
  COMMUNITIES,
];
export const REGIONS_FIRST = [
  REGIONS,
  PATTERNS,
  AGGREGATES,
  LEAVES,
  COMMUNITIES,
];
export const strategyOf = (tier: Tier): Strategy => {
  const strategy = DEFAULT_STRATEGIES.find((item) => item.tier === tier);
  if (!strategy)
    throw new Error("Presentation-only rows cannot form a split group");
  return strategy;
};

export interface Scored {
  part: Partition;
  ratio: number;
  priority: number;
  tie: number;
  kin: number;
  align: number;
  members: string[];
  // The overview edges left, so at an equal saving the aggregate with fewer
  // edges between overview nodes goes first.
  edges: number;
  // The overview edges left beside another between the same two nodes, at
  // least one a group: what a reader sees as parallel lines.
  parallel: number;
  // The members of the largest group the fold leaves, so at an equal saving
  // the fold keeping groups even goes first (SLOP-0038).
  largest: number;
}

const EPSILON = 1e-9;

// Whether every group a merge left alone, whose detail fitted, still fits:
// a merge can add a stub for a whole group to the details beside it.
export const othersFit = (ctx: CandidateContext, part: Partition): boolean =>
  ctx.part.groups.every(
    (g) =>
      !(part.groups.includes(g) && detailFits(ctx, ctx.part, g)) ||
      detailFits(ctx, part, g),
  );

// Applies each merge of a candidate in turn, with the group each one made;
// null when a merge makes no group or, capped, a detail over the target, unless
// the candidate folds whatever its detail's size (Candidate.splits).
const applyAll = (
  ctx: CandidateContext,
  merges: Merge[],
  capped: boolean,
): { part: Partition; groups: Group[] } | null => {
  let part = ctx.part;
  const groups: Group[] = [];
  for (const m of merges) {
    const next = merge(part, m);
    const g = mergedGroup(part, next, m.keys);
    if (!g) return null;
    if (capped && !detailFits(ctx, next, g)) return null;
    part = next;
    groups.push(g);
  }
  return capped && !othersFit(ctx, part) ? null : { part, groups };
};

// The fewest nodes an overview may keep: four, a chunk count a reader holds
// at once, unless the diagram has fewer than eight nodes. A fold that would
// leave fewer is not taken, so a plan keeps the overview closest to the
// target rather than a handful of huge groups.
export const MIN_OVERVIEW = 4;
const SMALL_DIAGRAM = 8;
export const floorOf = (work: WorkGraph): number =>
  work.ids.length < SMALL_DIAGRAM ? 1 : MIN_OVERVIEW;

// The edges beyond the first between each pair of overview nodes, whichever
// way each is written, at least one end a group.
const parallelOf = (qedges: readonly QEdge[]): number => {
  const pairs = qedges
    .filter((e) => isGroupKey(e.source) || isGroupKey(e.target))
    .map((e) => [e.source, e.target].sort(byText).join("\u0000"));
  return pairs.length - new Set(pairs).size;
};

// Whether a fold the step may take: an aggregate drawing no relationship
// beside another that the original draws between other ends, adding no new
// reachable pair where the step or the candidate asks, and where the step
// holds folds to the overview before it, taking away an overview edge per
// node hidden and adding no new reachable pair (SLOP-0035).
const admits = (
  ctx: CandidateContext,
  cand: Candidate,
  step: Step,
  drawn: Drawn,
): boolean => {
  const { work } = ctx;
  const { part } = drawn;
  if (
    cand.tier === "T4" &&
    foldedParallels(work, drawn.qedges) > foldedParallels(work, ctx.qedges)
  )
    return false;
  const loss = (): number => newReachablePairs(work, part);
  if (
    (step.lossless || cand.lossless) &&
    loss() > newReachablePairs(work, ctx.part)
  )
    return false;
  const { before } = step;
  return !(
    before &&
    (before.edges - drawn.shape.edges < drawn.hidden || loss() > before.loss)
  );
};

interface Drawn {
  part: Partition;
  qedges: QEdge[];
  shape: Shape;
  hidden: number;
}

const candidateScores = (
  candidate: Candidate,
): Pick<Scored, "priority" | "tie" | "kin" | "align"> => ({
  priority: candidate.priority ?? 0,
  tie: candidate.tie ?? 0,
  kin: candidate.kin ?? 0,
  align: candidate.align ?? 0,
});

export const evaluate = (
  ctx: CandidateContext,
  cand: Candidate,
  current: number,
  step: Step,
): Scored | null => {
  const { work, config } = ctx;
  const merges = [cand, ...(cand.also ?? [])];
  const applied = applyAll(ctx, merges, step.capped && cand.splits !== true);
  if (!applied) return null;
  const qedges = quotientEdges(work, applied.part);
  const shape = overviewShape(work, applied.part, qedges);
  if (shape.nodes < (step.floor ?? floorOf(work))) return null;
  const saved = current - scoreOf(shape, 0, config);
  if (saved <= EPSILON) return null;
  const hidden = merges.reduce((s, m) => s + Math.max(1, m.keys.length - 1), 0);
  if (!admits(ctx, cand, step, { part: applied.part, qedges, shape, hidden }))
    return null;
  return {
    part: applied.part,
    ratio: saved / hidden,
    ...candidateScores(cand),
    members: applied.groups[0]?.members ?? [],
    edges: shape.edges,
    parallel: parallelOf(qedges),
    largest: Math.max(0, ...applied.part.groups.map((g) => g.members.length)),
  };
};

// Of two aggregates that save as much, the one leaving fewer overview edges
// goes first, so fewer relationships run between groups.
// T6's own order: kin first, then gain, then label similarity, then how many
// overview neighbours the pair shares.
const byGain = (a: Scored, b: Scored): number => {
  if (a.kin !== b.kin) return b.kin - a.kin;
  for (const pick of [
    (x: Scored) => x.priority,
    (x: Scored) => x.tie,
    (x: Scored) => x.align,
  ]) {
    if (Math.abs(pick(a) - pick(b)) > EPSILON) return pick(b) - pick(a);
  }
  return 0;
};

export const compareScored = (
  a: Scored,
  b: Scored,
  ranking: Ranking,
): number => {
  const gain = ranking === "modularity" ? byGain(a, b) : 0;
  if (gain !== 0) return gain;
  if (Math.abs(a.ratio - b.ratio) > EPSILON) return b.ratio - a.ratio;
  if (ranking === "edges" && a.edges !== b.edges) return a.edges - b.edges;
  if (ranking === "balanced" && a.largest !== b.largest)
    return a.largest - b.largest;
  return byNaturalTuple(a.members, b.members);
};

// How one tier is walked: whether its details are held to the target, and
// which of its candidates it may take.
export interface Step {
  strategy: Strategy;
  capped: boolean;
  only?: (c: Candidate) => boolean;
  // The fewest overview nodes a fold may leave, floorOf by default.
  floor?: number;
  // The overview before the step, when a fold must take away at least one
  // overview edge for each node it hides, and add no new reachable pair
  // (SLOP-0035).
  before?: { edges: number; loss: number };
  // Whether a fold may add no new reachable pair.
  lossless?: boolean;
  // Whether twin chains fold whole, and whether their detail may be split
  // again (SLOP-0033).
  lanes?: LaneSearch;
}

export const bestStep = (
  ctx: CandidateContext,
  step: Step,
  current: number,
): Scored | null => {
  const { strategy, only = () => true } = step;
  const scored = strategy
    .propose({ ...ctx, uncapped: !step.capped, lanes: step.lanes })
    .filter(only)
    .map((c) => evaluate(ctx, c, current, step))
    .filter((s): s is Scored => s !== null);
  const ranked = scored.sort((a, b) => compareScored(a, b, strategy.ranking));
  return strategy.ranking === "density"
    ? (ranked[0] ?? null)
    : nearest(ranked, strategy.ranking === "modularity");
};

// How near a candidate's saving (or, in T6, its gain) must come to the best
// one's, as a share of it, to count as nearly equal.
export const NEAR = 0.05;

// Of the candidates nearly as good as the best, in T6 of the same kin, the
// first leaving the fewest parallel overview edges: a plan then draws fewer
// relationships side by side between groups at a saving nearly as large.
const nearest = (ranked: Scored[], byPriority: boolean): Scored | null => {
  const top = ranked[0];
  if (!top) return null;
  const primary = (x: Scored): number => (byPriority ? x.priority : x.ratio);
  const slack = Math.max(EPSILON, NEAR * Math.abs(primary(top)));
  const near = ranked.filter(
    (x) =>
      (!byPriority || x.kin === top.kin) && primary(top) - primary(x) <= slack,
  );
  return near.reduce((best, x) => (x.parallel < best.parallel ? x : best), top);
};
