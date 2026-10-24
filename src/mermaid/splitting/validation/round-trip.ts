import {
  calculateComplexity,
  type ThresholdConfig,
} from "../../complexity/metrics.ts";
import { type DiagramGraph, extractGraph } from "../../parsing/graph.ts";
import { type DiagramStats, extractStats } from "../../parsing/statistics.ts";
import { edgeKey } from "../graph/model.ts";
import { sorted } from "../graph/order.ts";
import type { Build } from "../planning/state.ts";

type Violations = string[];
// A start or end transition by its marker's shape and box, the state at its
// other end and its label; mermaid names markers afresh, so not by id.
const markerElements = (graph: DiagramGraph): string[] => {
  const markers = new Map(
    (graph.pseudo?.nodes ?? [])
      .filter((m) => m.shape !== "lollipop")
      .map((m) => [m.id, m]),
  );
  return (graph.pseudo?.edges ?? []).flatMap((e) => {
    const m = markers.get(e.source) ?? markers.get(e.target);
    if (!m) return [];
    const end = markers.has(e.source) ? e.target : e.source;
    return [
      JSON.stringify(["marker", m.shape, m.parent, end, e.label ?? null]),
    ];
  });
};

// A graph's elements as sorted text, for comparing what an emitted source
// parses to with what was planned. A shape or kind the plan leaves to the
// type's default is not compared; a lollipop is named by its label, since
// mermaid numbers interfaces afresh.
const elements = (graph: DiagramGraph, plan: DiagramGraph): string[] => {
  const shaped = new Map(plan.nodes.map((n) => [n.id, n.shape !== undefined]));
  const kinded = new Set(
    plan.edges
      .filter((e) => e.kind !== undefined)
      .map((e) => edgeKey({ ...e, kind: "" })),
  );
  const named = new Map(
    (graph.pseudo?.nodes ?? []).map((p) => [p.id, `()${p.label}`]),
  );
  const end = (x: string): string => named.get(x) ?? x;
  return sorted([
    ...graph.nodes.map((n) =>
      JSON.stringify([
        "node",
        n.id,
        n.label,
        n.markdown ?? false,
        n.parent,
        shaped.get(n.id) ? n.shape : null,
        n.rows ?? [],
        n.descriptions ?? [],
      ]),
    ),
    ...graph.subgraphs.map((s) =>
      JSON.stringify([
        "subgraph",
        s.id,
        s.label,
        s.markdown ?? false,
        s.parent,
        s.owner ?? null,
      ]),
    ),
    ...graph.edges.map((e) => {
      const ends = { ...e, source: end(e.source), target: end(e.target) };
      const kind = kinded.has(edgeKey({ ...ends, kind: "" }))
        ? (e.kind ?? null)
        : null;
      return JSON.stringify([
        "edge",
        ends.source,
        ends.target,
        e.label ?? null,
        e.markdown ?? false,
        kind,
        e.cardinality ?? null,
      ]);
    }),
    ...markerElements(graph),
  ]);
};

const reparse = async (
  label: string,
  source: string,
  expect: DiagramGraph,
  stats: DiagramStats,
): Promise<Violations> => {
  if (stats.error !== null)
    return [`9: the ${label} does not parse: ${stats.error}`];
  const counts = [stats.nodes, stats.edges, stats.subgraphs].join("/");
  const want = [
    expect.nodes.length,
    expect.edges.length,
    expect.subgraphs.length,
  ].join("/");
  if (counts !== want)
    return [
      `9: the ${label} parses to ${counts} nodes/edges/subgraphs, not ${want}`,
    ];
  const got = elements(await extractGraph(source), expect);
  const planned = elements(expect, expect);
  if (got.join("\n") === planned.join("\n")) return [];
  const stray = [
    ...got.filter((x) => !planned.includes(x)),
    ...planned.filter((x) => !got.includes(x)),
  ];
  return [
    `9: the ${label} parses to other elements than planned: ${stray.slice(0, 3).join(" ")}`,
  ];
};

// One emitted source: it parses to the planned graph, measures what was
// planned, and meets the target unless it is split again.
const roundTrip = async (
  name: string,
  d: {
    source: string;
    graph: DiagramGraph;
    nodes: number;
    score: number;
    split?: unknown;
  },
  config: ThresholdConfig,
): Promise<Violations> => {
  const stats = await extractStats(d.source);
  const out = await reparse(name, d.source, d.graph, stats);
  const score = calculateComplexity(stats, config).visual_complexity_score;
  if (
    !(
      d.split ||
      (stats.nodes <= config.node_target && score <= config.vcs_target)
    )
  )
    out.push(
      `9: the ${name} measures ${stats.nodes} nodes and ${score}, over the target`,
    );
  if (score !== d.score || stats.nodes !== d.nodes)
    out.push(`9: the ${name} score is not what was planned`);
  return out;
};

// 9. Every emitted source parses to the elements planned, and the overview,
// each detail and each row diagram, measured from that parse, meet the target.
export const checkRoundTrip = async (
  build: Build,
  config: ThresholdConfig,
): Promise<Violations> => {
  const { plan } = build;
  const overview = {
    source: plan.overviewSource,
    graph: plan.overview,
    nodes: plan.overviewNodes,
    score: plan.overviewScore,
  };
  const out = await roundTrip("overview", overview, config);
  for (const d of plan.details)
    out.push(...(await roundTrip(`detail of ${d.group}`, d, config)));
  for (const [i, r] of plan.rowDetails.entries())
    out.push(...(await roundTrip(`row diagram ${i + 1}`, r, config)));
  return out;
};
