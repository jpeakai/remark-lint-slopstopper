import type { DiagramGraph, GraphEdge } from "../../parsing/graph.ts";
import { edgeKey, endpointLabel, type WorkGraph } from "../graph/model.ts";
import { sorted } from "../graph/order.ts";
import {
  FROM,
  fromMembers,
  IN,
  ownSuffices,
  readerOf,
  readingsOf,
} from "../labels/context.ts";
import { soleRegion } from "../labels/groups.ts";
import type { Build, SplitGroup, SplitPlan } from "../planning/state.ts";
import { groupIds, overOf } from "./overview.ts";

type Violations = string[];

const tuple = (
  e: Pick<
    GraphEdge,
    "source" | "target" | "label" | "kind" | "cardinality" | "markdown"
  >,
): string => edgeKey(e);

const multiset = (keys: string[]): string => sorted(keys).join("\n");

// The edges overview and details give back. Exact: an edge between two kept
// nodes from the overview, and from a detail every edge whose ends are
// members or stubs for single nodes, with the details drawing each. Halves:
// an edge from a stub standing for a whole group, read as that group and the
// member it enters, or from a member into such a stub, read as that member
// and the group.
const recovered = (
  build: Build,
): { exact: string[]; halves: string[]; drawnIn: Map<string, string[]> } => {
  const groups = groupIds(build.plan);
  const exact: string[] = build.plan.overview.edges
    .filter((o) => !(groups.has(o.source) || groups.has(o.target)))
    .map((o) => tuple(o));
  const halves: string[] = [];
  const drawnIn = new Map<string, string[]>();
  const recoverDetail = (d: SplitPlan["details"][number]): void => {
    for (const e of d.graph.edges) {
      const [s, t] = [
        d.stubs[e.source] ?? e.source,
        d.stubs[e.target] ?? e.target,
      ];
      const key = tuple({ ...e, source: s, target: t });
      if (groups.has(s) || groups.has(t)) halves.push(key);
      else {
        exact.push(key);
        drawnIn.set(key, [...(drawnIn.get(key) ?? []), d.group]);
      }
    }
  };
  for (const detail of build.plan.details) recoverDetail(detail);
  return { exact, halves, drawnIn };
};

// The one value a set of edges agrees on, or none.
const agreedOn = (
  edges: GraphEdge[],
  pick: (e: GraphEdge) => string | undefined,
): string | undefined =>
  edges.every((e) => pick(e) === pick(edges[0] as GraphEdge))
    ? pick(edges[0] as GraphEdge)
    : undefined;

// Each edge between two groups, read from the detail that does not draw it
// exactly: as its source's group and its target when its source's detail
// draws it, else as its source and its target's group. The edges of one kind
// one way between one group and one member are one half, keeping the label
// and cardinality all agree on, and in an erDiagram one half per label and
// cardinality, as the overview draws one edge per pair.
const halfBucket = (half: GraphEdge, edge: GraphEdge, er: boolean): string =>
  JSON.stringify([
    half.source,
    half.target,
    edge.kind ?? "",
    er ? (edge.label ?? "") : "",
    er ? (edge.cardinality ?? "") : "",
  ]);

const wantedHalves = (
  build: Build,
  drawnIn: Map<string, string[]>,
): string[] => {
  const overId = overOf(build);
  const groups = groupIds(build.plan);
  const er = build.work.family === "er";
  const left = new Map([...drawnIn].map(([k, v]) => [k, [...v]]));
  const buckets = new Map<string, GraphEdge[]>();
  for (const e of build.work.edges) {
    const [a, b] = [overId(e.source), overId(e.target)];
    if (!(a !== b && groups.has(a) && groups.has(b))) continue;
    const half =
      left.get(tuple(e))?.shift() === b
        ? { ...e, target: b }
        : { ...e, source: a };
    const key = halfBucket(half, e, er);
    buckets.set(key, [...(buckets.get(key) ?? []), half]);
  }
  return [...buckets.values()].map(agreedHalf);
};

const agreedLabel = (
  label: string | undefined,
): Pick<GraphEdge, "label" | "markdown"> => {
  if (label === undefined) return {};
  return {
    label: label.slice(1),
    ...(label.startsWith("m") ? { markdown: true as const } : {}),
  };
};

const agreedHalf = (edges: GraphEdge[]): string => {
  const {
    label: _l,
    markdown: _m,
    kind: _k,
    cardinality: _c,
    ...bare
  } = edges[0] as GraphEdge;
  const label = agreedOn(edges, (x) =>
    x.label === undefined ? undefined : `${x.markdown ? "m" : "s"}${x.label}`,
  );
  const kind = agreedOn(edges, (x) => x.kind);
  const cardinality = agreedOn(edges, (x) => x.cardinality);
  return tuple({
    ...bare,
    ...agreedLabel(label),
    ...(kind !== undefined ? { kind } : {}),
    ...(cardinality !== undefined ? { cardinality } : {}),
  });
};

const detailNodes = (build: Build): Violations => {
  const out: Violations = [];
  const byId = new Map(build.plan.groups.map((g) => [g.id, g]));
  const overId = overOf(build);
  const groups = groupIds(build.plan);
  for (const d of build.plan.details) {
    const g = byId.get(d.group);
    const ids = d.graph.nodes
      .map((n) => n.id)
      .filter((id) => d.stubs[id] === undefined);
    if (!g || multiset(ids) !== multiset(g.members))
      out.push(`5: detail ${d.group} does not hold exactly its members`);
    out.push(
      ...Object.entries(d.stubs)
        .filter(([, end]) => (groups.has(end) ? end : overId(end)) === d.group)
        .map(([stub]) => `5: stub ${stub} of ${d.group} stands for itself`),
    );
    out.push(...drawnBothWays(build, d));
  }
  return out;
};

// A group is drawn whole or as stubs for its members, never both. A box of
// stubs for a group holds its members' stubs, so it does not draw it whole.
const drawnBothWays = (
  build: Build,
  d: SplitPlan["details"][number],
): Violations => {
  const overId = overOf(build);
  const groups = groupIds(build.plan);
  const boxes = new Set(d.graph.subgraphs.map((b) => b.id));
  const ends = Object.entries(d.stubs)
    .filter(([id]) => !boxes.has(id))
    .map(([, end]) => end);
  return ends
    .filter(
      (x) =>
        groups.has(x) && ends.some((y) => !groups.has(y) && overId(y) === x),
    )
    .map(
      (end) =>
        `5: detail ${d.group} draws ${end} whole beside a stub for one of its members`,
    );
};

const fromSuffix = (work: WorkGraph, from: string[]): string =>
  `${FROM}${work.nodes.get(from[0] ?? "")?.label ?? from[0] ?? ""}`;

// A stub for a whole group that names a member its edges leave draws only
// edges that member has: each, read from that member, is an original edge.
const fromHolds = (
  build: Build,
  d: SplitPlan["details"][number],
  stub: string,
  from: string[],
): Violations => {
  if (from.length === 0) return [];
  const original = new Set(build.work.edges.map(tuple));
  const drawn = d.graph.edges.filter((e) => e.source === stub);
  const held = drawn.every((e) =>
    from.some((m) => original.has(tuple({ ...e, source: m }))),
  );
  return drawn.length > 0 && held
    ? []
    : [
        `5: stub ${stub} of ${d.group} names a member that does not draw its edges`,
      ];
};

type Detail = SplitPlan["details"][number];

// A box of stubs (MJL-0037) and the stubs inside it, read by their form. A
// box shows the label exactly one group shows, sits at the top level, and
// stands for the region that group stands for whole, else for the group,
// when it draws no edge. A stub inside it shows the own label of exactly one
// member of that group, and stands for that member. Each is given the text
// the plan writes for its endpoint outside a box, so stubs for one endpoint
// read alike across details.
interface Boxed {
  bases: Map<string, string>;
  groupOf: Map<string, SplitGroup>;
  out: Violations;
}

const readBox = (
  build: Build,
  d: Detail,
  b: DiagramGraph["subgraphs"][number],
  into: Boxed,
): void => {
  const { plan, work } = build;
  const [g, ...more] = plan.groups.filter((x) => x.label === b.label);
  if (!g || more.length > 0) {
    into.out.push(
      `5: box ${b.id} of ${d.group}, "${b.label}", shows no one group's label`,
    );
    return;
  }
  const region = soleRegion(work, g);
  const end = d.stubs[b.id] ?? "";
  if (end !== (region ?? g.id))
    into.out.push(
      `5: box ${b.id} of ${d.group} reads as ${region ?? g.id}, not ${end}`,
    );
  if (b.parent !== null)
    into.out.push(`5: box ${b.id} of ${d.group} sits inside ${b.parent}`);
  if (
    region === null &&
    d.graph.edges.some((e) => e.source === b.id || e.target === b.id)
  )
    into.out.push(
      `5: box ${b.id} of ${d.group} draws an edge for a whole group`,
    );
  into.groupOf.set(b.id, g);
  into.bases.set(
    b.id,
    region === null
      ? g.label
      : `${endpointLabel(work, region)}${IN}${g.label})`,
  );
};

const readInBox = (
  build: Build,
  d: Detail,
  n: DiagramGraph["nodes"][number],
  into: Boxed,
): void => {
  const g = into.groupOf.get(n.parent ?? "");
  if (!g) return;
  const named = g.members.filter(
    (m) => build.work.nodes.get(m)?.label === n.label,
  );
  if (named.length !== 1 || named[0] !== d.stubs[n.id]) {
    const read = named.join(" or ") || "nothing";
    into.out.push(
      `5: stub ${n.id} in box ${n.parent} of ${d.group}, "${n.label}", reads as ${read}, not ${d.stubs[n.id]}`,
    );
  }
  const own = ownSuffices(
    { ...g, base: g.labelBase },
    n.label,
    n.markdown === true,
  );
  into.bases.set(n.id, own ? n.label : `${n.label}${IN}${g.label})`);
};

const boxNames = (build: Build, d: Detail): Boxed => {
  const into: Boxed = { bases: new Map(), groupOf: new Map(), out: [] };
  for (const b of d.graph.subgraphs.filter((x) => d.stubs[x.id] !== undefined))
    readBox(build, d, b, into);
  for (const n of d.graph.nodes.filter((x) => x.parent !== null))
    readInBox(build, d, n, into);
  return into;
};

// A stub's text names one thing: read by every form a plan writes, against
// every label the diagram and the plan's groups show, it has exactly one
// reading, the endpoint it stands for. One endpoint always reads one text,
// but for the member FROM names on a whole group's stub drawn apart, and
// that member draws every edge the stub draws.
// One detail's stubs read, each base text handed to seen with its endpoint.
const detailNames = (
  build: Build,
  reader: ReturnType<typeof readerOf>,
  d: Detail,
  seen: (end: string, base: string) => void,
): Violations => {
  const labelOf = new Map(d.graph.nodes.map((n) => [n.id, n.label]));
  const boxed = boxNames(build, d);
  const out = [...boxed.out];
  for (const [stub, end] of Object.entries(d.stubs)) {
    const inBox = boxed.bases.get(stub);
    if (inBox !== undefined) {
      seen(end, inBox);
      continue;
    }
    const label = labelOf.get(stub) ?? "";
    const from = fromMembers(reader, label, end);
    seen(
      end,
      from.length > 0
        ? label.slice(0, label.length - fromSuffix(build.work, from).length)
        : label,
    );
    const read = sorted(readingsOf(reader, label));
    if (read.join("\u0000") !== end)
      out.push(
        `5: stub ${stub} of ${d.group}, "${label}", reads as ${read.join(" or ") || "nothing"}, not ${end}`,
      );
    out.push(...fromHolds(build, d, stub, from));
  }
  return out;
};

const stubNames = (build: Build): Violations => {
  const { plan, work } = build;
  const groupOf = new Map(
    plan.groups.flatMap((g) =>
      [...g.members, ...g.regions].map((m) => [m, g.id] as const),
    ),
  );
  const reader = readerOf(
    work,
    plan.groups.map((g) => ({
      id: g.id,
      label: g.label,
      base: g.labelBase,
      ...(g.markdown ? { markdown: true as const } : {}),
    })),
    (id) => groupOf.get(id),
  );
  const byEnd = new Map<string, Set<string>>();
  const seen = (end: string, base: string): void => {
    byEnd.set(end, new Set([...(byEnd.get(end) ?? []), base]));
  };
  const out = plan.details.flatMap((d) => detailNames(build, reader, d, seen));
  for (const [end, labels] of byEnd)
    if (labels.size > 1) out.push(`5: the stubs for ${end} read differently`);
  return out;
};

// Each node drawn with rows, and how many diagrams draw them.
const rowsDrawn = (plan: SplitPlan): Map<string, DiagramGraph["nodes"]> => {
  const drawn = new Map<string, DiagramGraph["nodes"]>();
  const graphs = [
    ...plan.details.filter((d) => d.rows).map((d) => d.graph),
    ...plan.rowDetails.map((r) => r.graph),
  ];
  for (const n of graphs.flatMap((g) => g.nodes))
    if (n.rows) drawn.set(n.id, [...(drawn.get(n.id) ?? []), n]);
  return drawn;
};

// Auxiliary row diagrams only repeat original kept nodes. Matching a row
// diagram's own emitted source is insufficient evidence that it came from
// the input graph.
const rowDiagramViolations = (build: Build): Violations => {
  const grouped = new Set(build.plan.groups.flatMap((g) => g.members));
  return build.plan.rowDetails.flatMap((detail, index) => {
    const { graph, members } = detail;
    const declared =
      multiset(members) === multiset(graph.nodes.map((n) => n.id));
    const original = graph.nodes.every((node) => {
      const source = build.work.nodes.get(node.id);
      return (
        source &&
        !grouped.has(node.id) &&
        (source.rows?.length ?? 0) > 0 &&
        (node.rows?.length ?? 0) > 0 &&
        node.parent === null &&
        node.label === source.label &&
        node.markdown === source.markdown &&
        node.shape === source.shape &&
        JSON.stringify(node.descriptions ?? []) ===
          JSON.stringify(source.descriptions ?? [])
      );
    });
    const isolated =
      graph.edges.length === 0 &&
      graph.subgraphs.length === 0 &&
      (graph.pseudo?.nodes.length ?? 0) === 0 &&
      (graph.pseudo?.edges.length ?? 0) === 0;
    return declared && original && isolated && graph.nodes.length > 0
      ? []
      : [
          `5: row diagram ${index + 1} is not a diagram of its original kept nodes`,
        ];
  });
};

// Each original node's rows come back exactly where they are drawn, and the
// declared count is what no diagram draws.
const checkRows = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = rowDiagramViolations(build);
  const drawn = rowsDrawn(plan);
  for (const [id, copies] of drawn) {
    const want = JSON.stringify(work.nodes.get(id)?.rows ?? []);
    if (copies.some((n) => JSON.stringify(n.rows) !== want))
      out.push(`5: the rows of ${id} are not its own`);
    if (copies.length > 1)
      out.push(`5: the rows of ${id} are drawn ${copies.length} times`);
  }
  const shown = [...drawn.keys()].reduce(
    (s, id) => s + (work.nodes.get(id)?.rows?.length ?? 0),
    0,
  );
  const total = [...work.nodes.values()].reduce(
    (s, n) => s + (n.rows?.length ?? 0),
    0,
  );
  if (total !== work.rows)
    out.push("5: the rows read are not the rows counted");
  if (plan.loss.droppedRows !== work.rows - shown)
    out.push("7: the dropped rows are wrong");
  return out;
};

// 5. Overview and details give back exactly the original node ids and the
// original edges; every edge between groups is drawn from both ends, in its
// target's detail once for all edges from its group drawing alike.
export const checkRecoverable = (build: Build): Violations => {
  const { plan, work } = build;
  const out = [...detailNodes(build), ...stubNames(build), ...checkRows(build)];
  const kept = plan.overview.nodes
    .map((n) => n.id)
    .filter((id) => !groupIds(plan).has(id));
  const members = plan.details.flatMap((d) =>
    d.graph.nodes.map((n) => n.id).filter((id) => d.stubs[id] === undefined),
  );
  if (multiset([...kept, ...members]) !== multiset(work.ids))
    out.push("5: the node ids do not come back exactly");
  const { exact, halves, drawnIn } = recovered(build);
  if (multiset(exact) !== multiset(work.edges.map(tuple)))
    out.push("5: the edges do not come back exactly");
  // A half stands for every edge between its group and its member that draws
  // alike, so it is drawn exactly once, and only for such an edge, in the
  // detail that does not draw that edge exactly.
  if (new Set(halves).size !== halves.length)
    out.push("5: a detail draws one edge from a group twice");
  if (
    multiset([...new Set(halves)]) !==
    multiset([...new Set(wantedHalves(build, drawnIn))])
  )
    out.push("5: the edges between groups do not come back from their targets");
  return out;
};
