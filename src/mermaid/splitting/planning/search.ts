import type { ThresholdConfig } from "../../complexity/metrics.ts";
import type { WorkGraph } from "../graph/model.ts";
import { byNaturalTuple } from "../graph/order.ts";
import { newReachablePairs } from "../graph/reachability.ts";
import { assemble } from "../presentation/assemble.ts";
import { meets, overviewShape, quotientEdges, scoreOf } from "../projection/quotient.ts";
import { ID_FAMILY } from "../strategies/communities.ts";
import {
  adjacencyOf,
  type Candidate,
  type CandidateContext,
  foldable,
  keepsBranches,
  keepsFamilies,
  type LaneSearch,
  neighboursOf,
} from "./candidates.ts";
import { type FoldRules, RELAXED } from "./constraints.ts";
import {
  AGGREGATES,
  bestStep,
  compareScored,
  DEFAULT_STRATEGIES,
  evaluate,
  floorOf,
  MIN_OVERVIEW,
  othersFit,
  REGIONS_FIRST,
  type Scored,
  type Step,
  type Strategy,
  strategyOf,
} from "./selection.ts";
import {
  type Build,
  EMPTY_PARTITION,
  type Folded,
  type Group,
  groupOfKey,
  keyOf,
  membersOfKey,
  type Partition,
  parentOfKey,
  partitionOf,
  type Snapshot,
  snapshotOf,
  type Tier,
} from "./state.ts";

// A detail may be split once more; one at the second level must fit.
export const MAX_DEPTH = 2;

interface Measure {
  ctx: CandidateContext;
  nodes: number;
  score: number;
}

const measure = (work: WorkGraph, part: Partition, config: ThresholdConfig, rules: FoldRules): Measure => {
  const qedges = quotientEdges(work, part);
  const shape = overviewShape(work, part, qedges);

  return {
    ctx: { work, part, config, qedges, rules },
    nodes: shape.nodes,
    score: scoreOf(shape, 0, config),
  };
};

type DetailPolicy = "recursive" | "fitting" | "lossless";
type Density = "balanced" | "compact";
interface Walk {
  order: readonly Strategy[];

  // Holds author regions to details that fit, as every other tier is held.
  details: DetailPolicy;

  // What T5 and T6 may not fold.
  rules: FoldRules;

  // Lets the evening steps go below evenFloorOf, down to floorOf, for a
  // diagram whose details fit only when more of it folds.
  density: Density;

  // Folds an author region only when that adds no new reachable pair.
  // How twin chains fold (SLOP-0033).
  lanes?: LaneSearch;
}

// The share of node_target an evening step must leave in the overview, so a
// plan lands near its target rather than far below it.
export const EVEN_SHARE = 0.6;

export const evenFloorOf = (work: WorkGraph, config: ThresholdConfig): number =>
  Math.max(floorOf(work), Math.ceil(EVEN_SHARE * config.node_target));

const membersIn = (part: Partition, c: Candidate): number =>
  c.keys.reduce((n, k) => n + membersOfKey(part, k).length, 0);

// The candidates a tier may still take once the target is met, so the plan
// folds evenly. T3: the regions beside the ones folded, so sibling regions
// show alike. T5 and T6: merges no larger than the largest group and hiding
// as many nodes as the rules ask, so the nodes left open gather into groups
// of about the same size.
const evenOut = (
  part: Partition,
  tier: Tier,
  rules: FoldRules,
  work: WorkGraph,
): ((c: Candidate) => boolean) | null => {
  if (tier === "T4") {
    return tangled(work, part) ? () => true : null;
  }

  if (tier === "T2") {
    return part.groups.some((g) => g.reason === "decision region") ? (c) => c.reason === "decision region" : null;
  }

  if (tier === "T3") {
    const parents = new Set(part.groups.filter((g) => g.tier === "T3").map((g) => g.parent));

    return (c) => parents.has(c.parent) && c.keys.length > 1;
  }

  if (tier !== "T5" && tier !== "T6") {
    return null;
  }

  if (byFamilies(part)) {
    return (c) => c.reason === ID_FAMILY;
  }

  const largest = Math.max(0, ...part.groups.map((g) => g.members.length));

  return (c) => {
    const n = membersIn(part, c);

    return n <= largest && n > rules.minHidden;
  };
};

// Whether the plan folds id families, which then fold whole or not at all:
// the evening takes only the families still open, down to floorOf, since a
// family half folded or left open reads as scattered.
const byFamilies = (part: Partition): boolean => part.groups.some((g) => g.reason === ID_FAMILY);

// An overview a reader meets a cycle in for every MIN_OVERVIEW nodes, a
// chunk held at once: its independent cycles, edges less nodes plus one,
// number at least a quarter of its nodes. A tree-like overview is read as it
// is; a tangled one still reads better with its aggregates folded.
export const tangled = (work: WorkGraph, part: Partition): boolean => {
  const shape = overviewShape(work, part, quotientEdges(work, part));

  return MIN_OVERVIEW * (shape.edges - shape.nodes + 1) >= shape.nodes;
};

// Takes what evenOut allows, one best step at a time, while the overview
// keeps at least evenFloorOf nodes.
const foldEvenly = (start: Measure, step: Step, deep: boolean): Measure => {
  const { work, config, rules } = start.ctx;
  const floor = deep || byFamilies(start.ctx.part) ? floorOf(work) : evenFloorOf(work, config);
  let m = start;

  for (
    let only = evenOut(m.ctx.part, step.strategy.tier, rules, work);
    only;
    only = evenOut(m.ctx.part, step.strategy.tier, rules, work)
  ) {
    const before =
      step.strategy.tier === "T4"
        ? {
            edges: m.ctx.qedges.length,
            loss: newReachablePairs(work, m.ctx.part),
          }
        : undefined;
    const best = bestStep(m.ctx, { ...step, only, floor, ...(before ? { before } : {}) }, m.score);

    if (!best) {
      break;
    }

    m = measure(work, best.part, config, rules);
  }

  return m;
};

const LEAF_TIERS: ReadonlySet<Tier> = new Set(["T5", "T6"]);

// A T5 or T6 group, or a decision region, hiding fewer nodes than the rules
// ask, not yet given up on.
const smallGroup = (m: Measure, stuck: Set<string>): Group | undefined =>
  m.ctx.part.groups.find(
    (g) =>
      (LEAF_TIERS.has(g.tier) || g.reason === "decision region") &&
      g.members.length - 1 < m.ctx.rules.minHidden &&
      !stuck.has(keyOf(g)),
  );

// The overview without the group, when it still meets the target and every
// detail that fitted still fits, since the nodes given back become stubs.
const undo = (m: Measure, g: Group): Measure | null => {
  const { work, config, rules } = m.ctx;
  const next = measure(work, partitionOf(m.ctx.part.groups.filter((x) => x !== g)), config, rules);

  if (!meets(next.nodes, next.score, config)) {
    return null;
  }

  return othersFit(m.ctx, next.ctx.part) ? next : null;
};

// The group merged with the neighbour that saves the most score per node
// hidden: a node T6 may fold, or another T5 or T6 group, in the same region.
const grow = (m: Measure, g: Group): Measure | null => {
  const { ctx } = m;
  const key = keyOf(g);
  const joinable = (k: string): boolean => {
    const other = groupOfKey(ctx.part, k);
    const kind = other ? LEAF_TIERS.has(other.tier) : foldable(ctx, k);
    const near = parentOfKey(ctx.work, ctx.part, k) === g.parent;

    return kind && near && keepsBranches(ctx, [key, k]) && keepsFamilies(ctx, [key, k]);
  };

  const step: Step = { strategy: strategyOf(g.tier), capped: true };
  const best = [...neighboursOf(adjacencyOf(ctx.qedges), key)]
    .filter(joinable)
    .map((k) => evaluate(ctx, { keys: [key, k], parent: g.parent, tier: g.tier, reason: g.reason }, m.score, step))
    .filter((s): s is Scored => s !== null)
    .sort((a, b) => compareScored(a, b, "density"))[0];

  return best ? measure(ctx.work, best.part, ctx.config, ctx.rules) : null;
};

// Each T5 or T6 group hiding fewer nodes than the rules ask is undone when
// the overview meets the target without it, else grown into a neighbour. One
// that can be neither stays, since the target cannot be met otherwise. A
// decision region hiding one node is only undone: grown, it would no longer
// be a region.
const tidy = (start: Measure): Measure => {
  let m = start;
  const stuck = new Set<string>();

  for (let g = smallGroup(m, stuck); g; g = smallGroup(m, stuck)) {
    const next = undo(m, g) ?? (LEAF_TIERS.has(g.tier) ? grow(m, g) : null);

    if (next) {
      m = next;
    } else {
      stuck.add(keyOf(g));
    }
  }

  return m;
};

// A greedy walk can overshoot: an early fold that saved the most per node
// leaves a later one needed, and the two together leave the overview below
// evenFloorOf. While it is below, the group whose undoing gives back the most
// nodes and still meets the target, every fitting detail still fitting, is
// undone, so the overview lands nearest its target. A T2 group is one run of
// a pattern folded evenly (twins, sibling leaves, chain stages), so it stays:
// undone alone, it would leave its pattern half folded.
const loosen = (start: Measure): Measure => {
  const floor = evenFloorOf(start.ctx.work, start.ctx.config);
  let m = start;

  while (m.nodes < floor) {
    const best = m.ctx.part.groups
      .filter((g) => g.tier !== "T2" && g.reason !== ID_FAMILY)
      .flatMap((g) => {
        const next = undo(m, g);

        return next ? [{ next, members: g.members }] : [];
      })
      .sort((a, b) => b.next.nodes - a.next.nodes || byNaturalTuple(a.members, b.members))[0];

    if (!best) {
      break;
    }

    m = best.next;
  }

  return m;
};

// Whether an aggregate is closed: one member holds every relationship that
// crosses the group's edge and the others relate to nothing outside it, so
// folded it draws every relationship it had at the entity that holds it, and
// hides only the ones inside (SLOP-0035).
const closed = (work: WorkGraph, g: Group): boolean => {
  const inside = new Set(g.members);
  const faces = new Set(
    work.edges
      .filter((e) => inside.has(e.source) !== inside.has(e.target))
      .map((e) => (inside.has(e.source) ? e.source : e.target)),
  );

  return faces.size === 1;
};

// An erDiagram that meets the target with rows dropped alone still draws
// every entity and relationship: it folds its closed aggregates too, evenly,
// each named by every member, so the overview loses density and no name,
// and draws every relationship it keeps at its own entity. An aggregate
// whose other members relate outside it stays in view, as do other
// diagrams, at T1 (SLOP-0035).
const closedAggregates = (start: Measure, snapshots: Snapshot[], walk: Walk): Folded => {
  const { work } = start.ctx;
  const done: Folded = { work, part: EMPTY_PARTITION, snapshots, tier: "T1" };

  if (work.family !== "er" || !walk.order.includes(AGGREGATES)) {
    return done;
  }

  const folded = foldEvenly(start, { strategy: AGGREGATES, capped: true }, false).ctx.part.groups;
  const kept = folded.filter((g) => g.tier === "T4" && closed(work, g));

  if (kept.length === 0) {
    return done;
  }

  const part = partitionOf(kept);

  return {
    work,
    part,
    snapshots: [...snapshots, snapshotOf("T4", part)],
    tier: "T4",
  };
};

// How a walk climbs one tier: held to details that fit but for author regions
// and aggregates on a walk letting them fold whatever their size, and in T3
// adding no new reachable pair when the walk asks. T2 folds twin chains as the
// walk asks (SLOP-0033).
const stepOf = (strategy: Strategy, walk: Walk): Step => {
  const { tier } = strategy;
  const capped = !strategy.recursiveDetails || walk.details !== "recursive";

  return {
    strategy,
    capped,
    ...(walk.details === "lossless" && tier === "T3" ? { lossless: true } : {}),
    ...(tier === "T2" && walk.lanes ? { lanes: walk.lanes } : {}),
  };
};

// Folds tier by tier until the overview meets the target, or returns why not.
// A diagram whose rows alone put it over the target meets it at T1, rows
// dropped, and folds only its closed aggregates (SLOP-0035).
const finishFold = (measure: Measure, step: Step, walk: Walk): Measure => {
  const folded = tidy(foldEvenly(measure, step, walk.density === "compact"));

  return walk.density === "compact" ? folded : loosen(folded);
};

const foldToTarget = (work: WorkGraph, config: ThresholdConfig, walk: Walk): Folded | string => {
  let m = measure(work, EMPTY_PARTITION, config, walk.rules);
  const snapshots: Snapshot[] = [snapshotOf("T1", EMPTY_PARTITION)];

  if (meets(m.nodes, m.score, config)) {
    return closedAggregates(m, snapshots, walk);
  }

  let tier: Tier = "T1";

  for (const t of walk.order) {
    const step = stepOf(t, walk);

    for (let best = bestStep(m.ctx, step, m.score); best; ) {
      m = measure(work, best.part, config, walk.rules);
      tier = t.tier;

      if (meets(m.nodes, m.score, config)) {
        m = finishFold(m, step, walk);

        return {
          work,
          part: m.ctx.part,
          snapshots: [...snapshots, snapshotOf(t.tier, m.ctx.part)],
          tier,
        };
      }

      best = bestStep(m.ctx, step, m.score);
    }

    snapshots.push(snapshotOf(t.tier, m.ctx.part));
  }

  return `no tier reaches the target: the overview stops at ${m.nodes} nodes and a score of ${m.score}`;
};

// The new reachable pairs a build's details split again declare, at every depth.
const nestedLoss = (build: Build): number =>
  Object.values(build.nested).reduce((n, b) => n + b.plan.loss.newReachablePairs + nestedLoss(b), 0);

// The new reachable pairs a build declares, its own and its details'.
const totalLoss = (build: Build): number => build.plan.loss.newReachablePairs + nestedLoss(build);

interface SearchContext {
  work: WorkGraph;
  config: ThresholdConfig;
  depth: number;
  order: readonly Strategy[];
  lanes: LaneSearch;
}
interface Attempt {
  details: DetailPolicy;
  density: Density;
}

// Every attempt uses the same fold engine. Only detail admission and overview density vary.
const buildAttempt = (ctx: SearchContext, rules: FoldRules, attempt: Attempt): Build | string => {
  const { work, config, depth, order, lanes } = ctx;
  const folded = foldToTarget(work, config, {
    order,
    rules,
    lanes,
    ...attempt,
  });

  return typeof folded === "string"
    ? folded
    : assemble(folded, config, (detail) =>
        depth >= MAX_DEPTH ? "the split depth is exhausted" : planWork(detail, config, depth + 1, order),
      );
};

// Recursive detail splits yield to a fitting plan when that declares less reachability loss.
const minimizeLoss = (ctx: SearchContext, rules: FoldRules, built: Build): Build => {
  if (nestedLoss(built) === 0) {
    return built;
  }

  const fitting = (["lossless", "fitting"] as const)
    .map((details) => buildAttempt(ctx, rules, { details, density: "balanced" }))
    .find((result): result is Build => typeof result !== "string");

  return fitting && totalLoss(fitting) < totalLoss(built) ? fitting : built;
};

const searchDetails = (ctx: SearchContext, rules: FoldRules): Build | string => {
  const reasons = new Set<string>();
  const policies: DetailPolicy[] = ctx.depth >= MAX_DEPTH ? ["fitting"] : ["recursive", "fitting"];

  for (const details of policies) {
    const balanced = buildAttempt(ctx, rules, { details, density: "balanced" });

    if (typeof balanced !== "string") {
      return details === "recursive" ? minimizeLoss(ctx, rules, balanced) : balanced;
    }

    const compact = buildAttempt(ctx, rules, { details, density: "compact" });

    if (typeof compact !== "string") {
      return compact;
    }

    reasons.add(balanced);
  }

  return [...reasons].join("; then, holding regions to details that fit, ");
};

// Keep whole parallel lanes first. Stage them only after a failed search actually encountered lanes.
// Relax structural protections in their declared order, never bypassing the final contract verifier.
export const planWork = (
  work: WorkGraph,
  config: ThresholdConfig,
  depth: number,
  order: readonly Strategy[] = DEFAULT_STRATEGIES,
): Build | string => {
  const lanes: LaneSearch = {
    mode: depth < MAX_DEPTH ? "nested" : "whole",
    encountered: false,
  };
  const ctx = { work, config, depth, order, lanes };
  let reason = "";

  for (const mode of [lanes.mode, "staged"] as const) {
    if (mode === "staged" && !lanes.encountered) {
      break;
    }

    lanes.mode = mode;

    for (const rules of RELAXED) {
      const built = searchDetails(ctx, rules);

      if (typeof built !== "string") {
        return built;
      }

      reason = built;
    }
  }

  return reason;
};

// The ladders a diagram is walked along, preferred first.
export const laddersOf = (work: WorkGraph): Array<readonly Strategy[]> =>
  work.regionIds.length > 0 ? [REGIONS_FIRST, DEFAULT_STRATEGIES] : [DEFAULT_STRATEGIES];
