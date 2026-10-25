import type { ThresholdConfig } from "../../complexity/metrics.ts";
import type { GraphEdge, GraphNode } from "../../parsing/graph.ts";
import { edgeKey, idMaker, usedIds, type WorkGraph } from "../graph/model.ts";
import { byText, sorted } from "../graph/order.ts";
import {
  type Group,
  groupOfKey,
  isGroupKey,
  keyOf,
  over,
  type Partition,
} from "../planning/state.ts";
import {
  agreedAttributes,
  meets,
  nestingDepth,
  type Shape,
  scoreOf,
} from "./quotient.ts";

// A stub stands for one outside overview node: a kept node, a region or an
// interface by its own id, or a whole other group by its group key. A stub for
// a node inside another group stands for that node, so the edge is exact.
export interface Stub {
  id: string;
  endpoint: string;
}

export interface DetailView {
  members: string[];
  regions: string[];
  stubs: Stub[];
  edges: GraphEdge[];
  markers: GraphNode[];
  markerEdges: GraphEdge[];
}

const ROOT_MARKER: Record<string, string> = {
  stateStart: "root_start",
  stateEnd: "root_end",
};

// A marker transition as a detail draws it: an inside marker as it is, an
// outside one moved to the detail's own root marker. Null when the other end
// is not a member.
const markerEdgeIn = (
  e: GraphEdge,
  members: ReadonlySet<string>,
  markers: { inner: Map<string, GraphNode>; all: Map<string, GraphNode> },
): { edge: GraphEdge; marker: GraphNode } | null => {
  const marker = markers.all.get(e.source) ?? markers.all.get(e.target);
  if (!(marker && members.has(marker.id === e.source ? e.target : e.source)))
    return null;
  if (markers.inner.has(marker.id)) return { edge: e, marker };
  // A composite's marker pins the states it touches, so a group holding one
  // folds the composite whole and the marker is inner; this one stays out.
  if (marker.parent !== null) return null;
  const id = ROOT_MARKER[marker.shape ?? ""] ?? marker.id;
  const moved = {
    id,
    label: id,
    parent: null,
    ...(marker.shape ? { shape: marker.shape } : {}),
  };
  const swap = (x: string): string => (x === marker.id ? id : x);
  return {
    edge: { ...e, source: swap(e.source), target: swap(e.target) },
    marker: moved,
  };
};

// The start and end markers a detail draws: those inside its regions, and an
// outside marker's transition to a member, drawn from the detail's own root.
const detailMarkers = (
  work: WorkGraph,
  g: Group,
): { markers: GraphNode[]; markerEdges: GraphEdge[] } => {
  const regions = new Set(g.regions);
  const inner = new Map(
    work.markers
      .filter((m) => m.parent !== null && regions.has(m.parent))
      .map((m) => [m.id, m]),
  );
  const all = new Map(work.markers.map((m) => [m.id, m]));
  const members = new Set(g.members);
  const used = new Map<string, GraphNode>(inner);
  const edges = new Map<string, GraphEdge>();
  for (const e of work.markerEdges) {
    const drawn = markerEdgeIn(e, members, { inner, all });
    if (!drawn) continue;
    used.set(drawn.marker.id, drawn.marker);
    if (!edges.has(edgeKey(drawn.edge)))
      edges.set(edgeKey(drawn.edge), drawn.edge);
  }
  return {
    markers: [...used.values()].sort((a, b) => byText(a.id, b.id)),
    markerEdges: [...edges.values()],
  };
};

// What a detail's outside end stands for. An edge into the group from inside
// another group stands for that whole group: the source's own detail draws it
// to this exact node, so it reads back exactly once. A lollipop interface is
// drawn as itself, hanging from its member. Every other outside end stands
// for itself.
const outsideEnd = (
  work: WorkGraph,
  part: Partition,
  e: GraphEdge,
  inside: (id: string) => boolean,
): string | null => {
  if (work.lollipops.has(e.source) || work.lollipops.has(e.target)) return null;
  if (inside(e.target) && !inside(e.source)) {
    const from = over(part, e.source);
    return isGroupKey(from) ? from : e.source;
  }
  return inside(e.source) && !inside(e.target) ? e.target : null;
};

// Which half edges draw as one: those the same way between one group and one
// member, of one kind (a kind left out would read back as another), and in an
// erDiagram of one label and cardinality.
const halfKey = (
  work: WorkGraph,
  e: GraphEdge,
  [s, t]: [string, string],
): string =>
  JSON.stringify([
    s,
    t,
    e.kind ?? "",
    ...(work.family === "er" ? [e.label ?? "", e.cardinality ?? ""] : []),
  ]);

// A half edge, between a stub for a whole group and a member, drawn once for
// every edge halfKey puts with it, as the overview draws one edge between two
// overview nodes: keeping only the label and cardinality all agree on. Each
// of them is drawn exactly in the other group's detail.
const halfOf = (
  halves: Map<GraphEdge, GraphEdge[]>,
  e: GraphEdge,
): GraphEdge => {
  const bucket = halves.get(e);
  if (!bucket) return e;
  const { label: _l, markdown: _m, kind: _k, cardinality: _c, ...bare } = e;
  return { ...bare, ...agreedAttributes(bucket) };
};

// The group whose detail draws exactly every edge between two groups that
// edges join both ways: the one whose detail is split again when the other's
// is not, since a stub in a nested overview standing for a whole group hides
// which member a reader is sent to two levels away (SLOP-0033); then the one
// needing stubs for fewer of the other's members, then the first by key. The
// other group's detail draws one stub for the whole group, with every edge
// each way drawn once for those alike, so no detail draws a group whole beside
// stubs for its members.
export const exactSide = (
  work: WorkGraph,
  part: Partition,
  [a, b]: [string, string],
  nested: ReadonlySet<string> = new Set(),
): string => {
  if (nested.has(a) !== nested.has(b)) return nested.has(a) ? a : b;
  const between = work.edges.filter((e) => {
    const ends = [over(part, e.source), over(part, e.target)];
    return ends.includes(a) && ends.includes(b) && a !== b;
  });
  const needs = (side: string): number =>
    new Set(
      between
        .flatMap((e) => [e.source, e.target])
        .filter((x) => over(part, x) !== side),
    ).size;
  const [na, nb] = [needs(a), needs(b)];
  return na !== nb ? (na < nb ? a : b) : byText(a, b) <= 0 ? a : b;
};

// How a plan draws its details: the groups whose details are split again,
// and the target each detail is held to.
export interface Drawing {
  nested: ReadonlySet<string>;
  config: ThresholdConfig;
}

const betweenOf = (
  work: WorkGraph,
  part: Partition,
  [a, b]: [string, string],
): GraphEdge[] =>
  work.edges.filter(
    (e) => over(part, e.source) === a && over(part, e.target) === b,
  );

// The outside overview nodes a group's detail meets: the far end of every
// edge with one end in the group.
const outsideOf = (work: WorkGraph, part: Partition, key: string): number =>
  new Set(
    work.edges.flatMap((e) => {
      const [s, t] = [over(part, e.source), over(part, e.target)];
      return s === key && t !== key ? [t] : t === key && s !== key ? [s] : [];
    }),
  ).size;

// Whether the target of edges joining group a to group b one way only asks
// to draw them exactly (SLOP-0038): the source's detail is not split again
// (SLOP-0033), and the target needs stubs for fewer of the source's members
// than the source needs of the target's, or for as many, two or more, when
// the target's detail meets fewer outside nodes than the source's, so stubs
// spread evenly. A single edge is drawn exactly by its source, as before.
const asksExact = (
  work: WorkGraph,
  part: Partition,
  [a, b]: [string, string],
  nested: ReadonlySet<string>,
): boolean => {
  if (nested.has(a)) return false;
  const between = betweenOf(work, part, [a, b]);
  const sources = new Set(between.map((e) => e.source)).size;
  const targets = new Set(between.map((e) => e.target)).size;
  if (sources !== targets) return sources < targets;
  return sources > 1 && outsideOf(work, part, b) < outsideOf(work, part, a);
};

// Whether a group's detail still meets the target with every group joined to
// it one way that asks so drawn as stubs for that group's members: planning
// measures each as one stub, its edges alike drawn once.
const holdsExact = (
  work: WorkGraph,
  part: Partition,
  b: string,
  drawing: Drawing,
): boolean => {
  const g = groupOfKey(part, b);
  if (!g) return false;
  const shape = detailShape(work, detailView(work, part, g));
  const sources = new Set(
    work.edges
      .filter((e) => over(part, e.target) === b)
      .map((e) => over(part, e.source)),
  );
  let [nodes, edges] = [shape.nodes, shape.edges];
  for (const a of sources) {
    if (a === b || !isGroupKey(a) || betweenOf(work, part, [b, a]).length > 0)
      continue;
    if (!asksExact(work, part, [a, b], drawing.nested)) continue;
    const between = betweenOf(work, part, [a, b]);
    nodes += new Set(between.map((e) => e.source)).size - 1;
    edges +=
      between.length -
      new Set(between.map((e) => halfKey(work, e, [a, e.target]))).size;
  }
  return meets(
    nodes,
    scoreOf({ ...shape, nodes, edges }, 0, drawing.config),
    drawing.config,
  );
};

// The group whose detail draws exactly the edges from group a into group b,
// joined one way only, as a plan draws it. The source draws them, unless the
// target asks to (asksExact) and its detail still meets the target with
// every group asking so drawn as stubs (holdsExact). Then the target draws
// them from a stub for each source member, and the source draws the target
// as one stub, each edge alike drawn once.
export const oneWayExact = (
  work: WorkGraph,
  part: Partition,
  [a, b]: [string, string],
  drawing: Drawing,
): string =>
  asksExact(work, part, [a, b], drawing.nested) &&
  (drawing.nested.has(b) || holdsExact(work, part, b, drawing))
    ? b
    : a;

// Classify each outside group once. One-way entries say whether the edge
// leaves this group; groups joined in both directions need exact-side choice.
const connectionsOf = (
  part: Partition,
  key: string,
  touching: GraphEdge[],
): { both: Set<string>; oneWay: Map<string, boolean> } => {
  const [into, from] = [new Set<string>(), new Set<string>()];
  for (const e of touching) {
    const [s, t] = [over(part, e.source), over(part, e.target)];
    if (s === key && t !== key && isGroupKey(t)) into.add(t);
    if (t === key && s !== key && isGroupKey(s)) from.add(s);
  }
  return {
    both: new Set([...into].filter((x) => from.has(x))),
    oneWay: new Map([
      ...[...into].filter((x) => !from.has(x)).map((x) => [x, true] as const),
      ...[...from].filter((x) => !into.has(x)).map((x) => [x, false] as const),
    ]),
  };
};

// One stub per outside end, and each edge from a whole group drawn alike
// another drawn once. A group that edges join to this one both ways is drawn
// whole, or as stubs for its members, never both, as exactSide decides from
// the groups whose details are split again, given only as a plan draws the
// detail. As a plan draws it, a group joined one way may be drawn as
// oneWayExact decides; planning, which gives none, measures each
// detail with edges from a group drawn from one stub, so a drawn detail never
// holds more stubs than the one measured.
interface DetailEdgeContext {
  work: WorkGraph;
  stubOf: Map<string, string>;
  inside: (id: string) => boolean;
  halves: Map<string, GraphEdge[]>;
}

const drawDetailEdge = (
  { work, stubOf, inside, halves }: DetailEdgeContext,
  edge: GraphEdge,
  end: string | null | undefined,
): GraphEdge[] => {
  if (end === null || end === undefined) return [edge];
  const stub = stubOf.get(end) ?? end;
  const fromInside = inside(edge.source);
  const drawn = fromInside
    ? { ...edge, target: stub }
    : { ...edge, source: stub };
  if (!isGroupKey(end)) return [drawn];
  const bucket = halfKey(
    work,
    edge,
    fromInside ? [edge.source, end] : [end, edge.target],
  );
  const known = halves.get(bucket);
  if (known) known.push(drawn);
  else halves.set(bucket, [drawn]);
  return known ? [] : [drawn];
};

export const detailView = (
  work: WorkGraph,
  part: Partition,
  g: Group,
  drawing: Drawing | null = null,
): DetailView => {
  const nested = drawing?.nested ?? new Set<string>();
  const key = keyOf(g);
  const inside = (id: string): boolean => over(part, id) === key;
  const touching = work.edges.filter(
    (e) => inside(e.source) || inside(e.target),
  );
  const connections = connectionsOf(part, key, touching);
  const ways =
    drawing === null ? new Map<string, boolean>() : connections.oneWay;
  const pairs = new Set([...connections.both, ...ways.keys()]);
  const exact = (h: string): string => {
    const out = ways.get(h);
    if (out === undefined) return exactSide(work, part, [key, h], nested);
    if (drawing === null) return key;
    return out
      ? oneWayExact(work, part, [key, h], drawing)
      : oneWayExact(work, part, [h, key], drawing);
  };
  const whole = new Set([...pairs].filter((h) => exact(h) !== key));
  const endOf = (e: GraphEdge): string | null => {
    const end = outsideEnd(work, part, e, inside);
    if (end === null) return null;
    const far = inside(e.source) ? e.target : e.source;
    const group = over(part, far);
    if (!pairs.has(group)) return end;
    return whole.has(group) ? group : far;
  };
  const ends = new Map(touching.map((e) => [e.id, endOf(e)]));
  const outside = sorted(
    new Set([...ends.values()].filter((x): x is string => x !== null)),
  );
  const next = idMaker(usedIds(work), "s");
  const stubs = outside.map((endpoint) => ({ id: next(), endpoint }));
  const stubOf = new Map(
    outside.map((endpoint, i) => [endpoint, stubs[i]?.id ?? endpoint]),
  );
  const halves = new Map<string, GraphEdge[]>();
  const edges = touching.flatMap((edge) =>
    drawDetailEdge({ work, stubOf, inside, halves }, edge, ends.get(edge.id)),
  );
  const halfByEdge = new Map(
    [...halves.values()].map((bucket) => [bucket[0] as GraphEdge, bucket]),
  );
  return {
    members: g.members,
    regions: drawnRegions(work, g),
    stubs,
    edges: edges.map((e) => halfOf(halfByEdge, e)),
    ...detailMarkers(work, g),
  };
};

// The regions a detail draws: the ones its group folds, and in a classDiagram
// every namespace around them too, since mermaid makes each namespace a
// dotted name names.
const drawnRegions = (work: WorkGraph, g: Group): string[] => {
  if (work.family !== "class") return g.regions;
  const out = new Set(g.regions);
  for (const r of g.regions) {
    for (
      let p = work.regions.get(r)?.parent ?? null;
      p !== null && !out.has(p);
      p = work.regions.get(p)?.parent ?? null
    ) {
      out.add(p);
    }
  }
  return sorted(out);
};

export const detailShape = (work: WorkGraph, view: DetailView): Shape => {
  const drawn = new Set(view.regions);
  return {
    nodes: view.members.length + view.stubs.length,
    edges: view.edges.length,
    subgraphs: view.regions.length,
    depth: nestingDepth(view.regions, (r) => {
      const p = work.regions.get(r)?.parent ?? null;
      return p !== null && drawn.has(p) ? p : null;
    }),
  };
};
