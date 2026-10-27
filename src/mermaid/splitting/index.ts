import { calculateComplexity, type ThresholdConfig } from "../complexity/metrics.ts";
import { getMermaidCore } from "../parsing/engine.ts";
import { type DiagramGraph, extractGraph } from "../parsing/graph.ts";
import { type DiagramStats, extractStats } from "../parsing/statistics.ts";
import { buildWorkGraph, familyOf, type Measured, type WorkGraph } from "./graph/model.ts";
import { RANGE_SEPARATOR } from "./labels/text.ts";
import { laddersOf, planWork } from "./planning/search.ts";
import type { SplitOutcome, SplitPlan } from "./planning/state.ts";
import { meshMatrix, starList } from "./presentation/alternatives.ts";
import { meets } from "./projection/quotient.ts";
import { DENSE } from "./strategies/communities.ts";
import { checkContract } from "./validation/contract.ts";

// Split plans: for a diagram over its density target, an overview where some
// node sets fold into group nodes, plus one detail diagram per group, offered
// only when contract.ts proves the pair recovers the original. Nothing is
// applied; a plan is a recommendation (SLOP-0031).

export type { SplitOutcome, SplitPlan } from "./planning/state.ts";

const refuse = (reason: string, violations: string[] = []): SplitOutcome => ({
  plan: null,
  reason,
  violations,
});

// A refusal because a list or a table reads better, with that list or table
// built from the whole diagram (SLOP-0035).
const refuseFor = (graph: DiagramGraph, reason: string): SplitOutcome => ({
  ...refuse(reason),
  alternative: reason === STAR ? starList(graph) : meshMatrix(graph),
});

export const DENSE_MESH = "dense mesh: a matrix or table reads better than a diagram";

// The most links a node of a readable overview averages: a hub's degree.
const MESH_DEGREE = 4;

// A dense mesh: a graph joining at least half of all its node pairs, and more
// pairs than its nodes times half of MESH_DEGREE, so its nodes average more
// links than a hub has. Folding a mesh leaves a mesh, since its groups are
// joined to each other too, so neither the diagram nor an overview of this
// shape is offered: a matrix or a table reads better.
export const isDenseMesh = (graph: Pick<DiagramGraph, "nodes" | "edges">): boolean => {
  const n = graph.nodes.length;
  const pairs = new Set(
    graph.edges.filter((e) => e.source !== e.target).map((e) => [e.source, e.target].sort().join("\u0000")),
  ).size;

  return n >= 2 && pairs >= DENSE * ((n * (n - 1)) / 2) && pairs > (n * MESH_DEGREE) / 2;
};

// The direction, as mermaid's own parser read it. The graph does not carry
// it, and an emitted diagram keeps it.
export const directionOf = async (source: string): Promise<string> => {
  const mermaid = await getMermaidCore();
  const { db } = await mermaid.mermaidAPI.getDiagramFromText(source);

  return db.getDirection?.() ?? "";
};

// A plan, or why there is none: out of scope, already within target, no tier
// reaching the target, or the contract's violations.
export const splitOutcome = async (source: string, config: ThresholdConfig): Promise<SplitOutcome> => {
  const stats = await extractStats(source);

  if (stats.error !== null) {
    return refuse(`the diagram does not parse: ${stats.error}`);
  }

  if (stats.diagram_type === "sequence") {
    return refuse("a sequence diagram is not split: its graph drops message order");
  }

  const family = familyOf(stats.diagram_type);

  if (!family) {
    return refuse(`a ${stats.diagram_type} diagram is not split`);
  }

  if (meets(stats.nodes, calculateComplexity(stats, config).visual_complexity_score, config)) {
    return refuse("the diagram is already within the target");
  }

  const graph = await extractGraph(source);
  const counts = [graph.nodes.length, graph.edges.length, graph.subgraphs.length].join("/");

  if (counts !== [stats.nodes, stats.edges, stats.subgraphs].join("/")) {
    return refuse("the graph does not count what the stats count");
  }

  // A detail or overview would draw a composite's regions as one, which the
  // emitted text cannot tell apart, so no plan is offered.
  if (graph.subgraphs.some((s) => (s.regions ?? 0) > 1)) {
    return refuse("concurrent state regions are not split");
  }

  if (isDenseMesh(graph)) {
    return refuseFor(graph, DENSE_MESH);
  }

  const work = buildWorkGraph(graph, {
    direction: await directionOf(source),
    rows: stats.rows,
    measured: measuredOf(stats),
  });
  const outcome = await firstPassing(work, config);

  return outcome.plan === null && (outcome.reason === STAR || outcome.reason === DENSE_MESH)
    ? refuseFor(graph, outcome.reason)
    : outcome;
};

// The size the complexity rules measured a diagram at, rows aside.
export const measuredOf = (stats: DiagramStats): Measured => ({
  nodes: stats.nodes,
  edges: stats.edges,
  subgraphs: stats.subgraphs,
  depth: Math.max(stats.max_subgraph_depth, stats.max_tree_depth),
});

export const STAR = "a star of leaves around one node, which no label, shape or neighbour sorts: a list reads better";

// A star: a plan whose every group is a run of sibling leaves named only by
// the range of its labels, holding more than half of the diagram. Nothing
// the author drew sorts the leaves (twins already part by edge label, kind
// and shape), so the groups are alphabetical buckets, which carry no meaning
// a reader could use: a list of the leaves reads better than such a plan.
export const isStar = (plan: SplitPlan, nodes: number): boolean => {
  // A group's place in the overview: its shape and every edge it draws, by
  // the other end, the way it runs and its attributes. Groups of one twin
  // class all sit alike.
  const place = (id: string, shape: string | undefined): string =>
    JSON.stringify([
      shape ?? null,
      plan.overview.edges
        .filter((e) => e.source === id || e.target === id)
        .map((e) => [e.source === id ? ">" : "<", e.source === id ? e.target : e.source, e.label, e.kind])
        .sort(),
    ]);
  const { groups } = plan;

  return (
    groups.length > 0 &&
    groups.every((g) => g.reason === "sibling leaves" && g.labelBase.includes(RANGE_SEPARATOR)) &&
    new Set(groups.map((g) => place(g.id, g.shape))).size === 1 &&
    2 * groups.reduce((n, g) => n + g.members.length, 0) > nodes
  );
};

// The plan of the first ladder that passes the contract, and whose overview
// is no dense mesh and no star: author regions
// first when the diagram has them, then the default ladder. With none, the
// last ladder's reason.
const firstPassing = async (work: WorkGraph, config: ThresholdConfig): Promise<SplitOutcome> => {
  let outcome = refuse("no ladder was walked");

  for (const order of laddersOf(work)) {
    const built = planWork(work, config, 1, order);

    if (typeof built === "string") {
      outcome = refuse(built);
      continue;
    }

    if (isDenseMesh(built.plan.overview)) {
      outcome = refuse(DENSE_MESH);
      continue;
    }

    if (isStar(built.plan, work.ids.length)) {
      outcome = refuse(STAR);
      continue;
    }

    const violations = await checkContract(built, config);

    if (violations.length === 0) {
      return { plan: built.plan, reason: "", violations: [] };
    }

    outcome = refuse("the plan breaks the contract", violations);
  }

  return outcome;
};
