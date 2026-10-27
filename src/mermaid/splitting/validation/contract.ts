import type { ThresholdConfig } from "../../complexity/metrics.ts";
import type { GraphEdge } from "../../parsing/graph.ts";
import { flowRegionsOf } from "../graph/flow-regions.ts";
import { byOverviewEdge, homeOf, idMaker, regionWithin, usedIds } from "../graph/model.ts";
import { byText, byTuple } from "../graph/order.ts";
import { newReachablePairs } from "../graph/reachability.ts";
import { floorOf } from "../planning/selection.ts";
import { type Build, partFromGroups, type SplitGroup } from "../planning/state.ts";
import { overviewMarkers } from "../presentation/graphs.ts";
import { ladderOf } from "../projection/quotient.ts";
import { checkLabels } from "./labels.ts";
import { checkAttributes, checkEdges, checkPartition, groupIds, overOf } from "./overview.ts";
import { checkRecoverable } from "./recovery.ts";
import { checkRoundTrip } from "./round-trip.ts";

type Violations = string[];

// 6. A protected node folds only inside a whole region the group folds: an
// author region, its own or, for a state a composite's marker touches, that
// composite; or a decision region holding it, single-entry single-exit in the
// original graph, every node of which the group holds.
const checkProtected = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = [];
  const checkGroup = (g: SplitGroup): void => {
    const held = new Set(g.members);
    const flows = flowRegionsOf(work).filter((r) => r.members.every((x) => held.has(x)));

    for (const m of g.members) {
      if (!work.protectedIds.has(m) || flows.some((r) => r.members.includes(m))) {
        continue;
      }

      const pin = work.pins.get(m) ?? homeOf(work, m);

      if (!g.regions.some((r) => regionWithin(work, pin, r))) {
        out.push(`6: protected ${m} is folded in ${g.id}`);
      }
    }
  };

  for (const group of plan.groups) {
    checkGroup(group);
  }

  return out;
};

// A start or end transition the overview draws onto a group stands for
// transitions of that marker into the group's members, carries a label only
// when they all do, and every such transition is drawn onto its group.
const checkMarkers = (build: Build): Violations => {
  const { plan, work } = build;

  if (work.family !== "state") {
    return [];
  }

  const overId = overOf(build);
  const groups = groupIds(plan);
  const markers = new Set(work.markers.map((m) => m.id));
  const drawn = new Set((plan.overview.pseudo?.nodes ?? []).map((m) => m.id));
  const pairOf = (e: GraphEdge): [string, string] =>
    markers.has(e.source) ? [e.source, overId(e.target)] : [e.target, overId(e.source)];
  const onGroups = (plan.overview.pseudo?.edges ?? []).filter((o) => groups.has(o.source) || groups.has(o.target));
  const sound = onGroups.flatMap((o) => {
    const [m, g] = pairOf(o);
    const witnesses = work.markerEdges.filter((e) => pairOf(e).join("\u0000") === `${m}\u0000${g}`);

    if (witnesses.length === 0) {
      return [`7: the transition of ${m} onto ${g} stands for none`];
    }

    return o.label !== undefined && witnesses.some((e) => e.label !== o.label)
      ? [`7: the transition of ${m} onto ${g} carries a label not all of its transitions carry`]
      : [];
  });
  const shown = new Set(onGroups.map((o) => pairOf(o).join("\u0000")));
  const complete = work.markerEdges
    .map(pairOf)
    .filter(([m, g]) => drawn.has(m) && groups.has(g) && !shown.has(`${m}\u0000${g}`))
    .map(([m, g]) => `7: the transition of ${m} into ${g} is not drawn onto its group`);
  const declared =
    overviewMarkers(work, partFromGroups(plan.groups)).merged === plan.loss.mergedMarkers
      ? []
      : ["7: the declared merged start and end transitions are wrong"];

  return [...sound, ...complete, ...declared];
};

// 7. The declared loss is the loss: new reachable pairs recounted for the
// final partition and after each tier, zero after T2.
const checkLoss = (build: Build): Violations => {
  const { plan, work, snapshots } = build;
  const out: Violations = [...checkMarkers(build)];

  if (newReachablePairs(work, partFromGroups(plan.groups)) !== plan.loss.newReachablePairs) {
    out.push("7: the declared new reachable pairs are wrong");
  }

  for (const s of snapshots) {
    const n = newReachablePairs(work, partFromGroups(s.groups));

    if (plan.loss.byTier[s.tier] !== n) {
      out.push(`7: the declared loss after ${s.tier} is wrong`);
    }

    if (s.tier === "T2" && n !== 0) {
      out.push("7: T2 made new reachable pairs");
    }
  }

  return out;
};

const isSorted = <T>(xs: readonly T[], compare: (a: T, b: T) => number): boolean =>
  xs.every((x, i) => i === 0 || compare(xs[i - 1] as T, x) < 0);

// 8. The plan is in canonical order: members sorted, groups by member tuple
// and numbered in that order, kept nodes by id, edges by their ends and
// attributes, the edges between one pair of nodes side by side whichever
// way each is written, details in group order.
const checkCanonical = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = [];
  const next = idMaker(usedIds(work), "g");

  if (!plan.groups.every((g) => isSorted(g.members, byText) && isSorted(g.regions, byText))) {
    out.push("8: members are not sorted");
  }

  if (
    !isSorted(
      plan.groups.map((g) => g.members),
      byTuple,
    )
  ) {
    out.push("8: groups are not in member order");
  }

  if (!plan.groups.every((g) => g.id === next())) {
    out.push("8: group ids are not numbered in order");
  }

  const kept = plan.overview.nodes.filter((n) => !groupIds(plan).has(n.id)).map((n) => n.id);

  if (!isSorted(kept, byText)) {
    out.push("8: overview nodes are not sorted");
  }

  // An edge written twice between kept nodes is drawn twice, so equal keys sit side by side.
  const edges = plan.overview.edges;

  if (!edges.every((e, i) => i === 0 || byOverviewEdge(edges[i - 1] ?? e, e) <= 0)) {
    out.push("8: overview edges are not sorted");
  }

  if (plan.details.some((d, i) => d.group !== plan.groups[i]?.id)) {
    out.push("8: details are not in group order");
  }

  return out;
};

// Every check, on the plan and on each detail split again.
export const checkContract = async (build: Build, config: ThresholdConfig): Promise<Violations> => {
  const out = [
    ...(build.plan.overviewNodes < floorOf(build.work)
      ? [`9: the overview holds ${build.plan.overviewNodes} nodes, fewer than ${floorOf(build.work)}`]
      : []),
    ...checkPartition(build),
    ...checkEdges(build),
    ...checkAttributes(build),
    ...checkLabels(build),
    ...checkRecoverable(build),
    ...checkProtected(build),
    ...checkLoss(build),
    ...(JSON.stringify(ladderOf(build.work, build.snapshots, config)) === JSON.stringify(build.plan.ladder)
      ? []
      : ["7: the declared ladder is not the overview after each tier"]),
    ...checkCanonical(build),
    ...(await checkRoundTrip(build, config)),
  ];

  for (const [group, nested] of Object.entries(build.nested)) {
    const d = build.plan.details.find((x) => x.group === group);

    if (!d || d.split !== nested.plan) {
      out.push(`5: the split of ${group} is not the plan checked`);
    }

    out.push(...(await checkContract(nested, config)).map((v) => `${group}: ${v}`));
  }

  for (const d of build.plan.details) {
    if (d.split && !build.nested[d.group]) {
      out.push(`5: the split of ${d.group} was never checked`);
    }
  }

  return out;
};
