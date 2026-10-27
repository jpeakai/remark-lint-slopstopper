import type { ThresholdConfig } from "../../complexity/metrics.ts";
import type { DiagramGraph, GraphEdge, GraphNode } from "../../parsing/graph.ts";
import {
  byOverviewEdge,
  edgeKey,
  endpointLabel,
  idMaker,
  usedIds,
  type WNode,
  type WorkGraph,
} from "../graph/model.ts";
import { byText } from "../graph/order.ts";
import { type LabelContext, memberText, type StubText } from "../labels/context.ts";
import { soleRegion } from "../labels/groups.ts";
import { groupOfKey, isGroupKey, over, type Partition, type SplitGroup } from "../planning/state.ts";
import { type DetailView, detailShape, type Stub } from "../projection/detail.ts";
import { meets, type QEdge, quotientEdges, remainingRegions, type Shape, scoreOf } from "../projection/quotient.ts";

export const graphNode = (n: WNode, parent: string | null, rows: boolean): GraphNode => ({
  id: n.id,
  label: n.label,
  parent,
  ...(n.shape ? { shape: n.shape } : {}),
  ...(n.markdown ? { markdown: true as const } : {}),
  ...(rows && n.rows?.length ? { rows: n.rows } : {}),
  ...(n.descriptions?.length ? { descriptions: n.descriptions } : {}),
});

const regionNode = (work: WorkGraph, id: string, parent: string | null): GraphNode => {
  const r = work.regions.get(id);

  return {
    id,
    label: r?.owner ? "" : (r?.label ?? id),
    parent,
    ...(r?.owner !== undefined ? { owner: r.owner } : {}),
    ...(r?.markdown ? { markdown: true as const } : {}),
  };
};

const sortEdges = <E extends GraphEdge>(edges: E[]): E[] => [...edges].sort((a, b) => byText(edgeKey(a), edgeKey(b)));

const qEdge = (e: QEdge, idOf: (k: string) => string): GraphEdge & { covers: string[] } => ({
  id: "",
  source: idOf(e.source),
  target: idOf(e.target),
  ...(e.label !== undefined ? { label: e.label } : {}),
  ...(e.markdown ? { markdown: true as const } : {}),
  ...(e.kind !== undefined ? { kind: e.kind } : {}),
  ...(e.cardinality !== undefined ? { cardinality: e.cardinality } : {}),
  covers: e.covers,
});

const markerIds = (work: WorkGraph): Set<string> => new Set(work.markers.map((m) => m.id));

// What the overview draws but does not count: the markers of regions still
// drawn, with each transition's other end moved to its overview node, and
// every lollipop interface, on its class or on the group folding its class.
const overviewPseudo = (
  work: WorkGraph,
  part: Partition,
  idOf: (k: string) => string,
): DiagramGraph["pseudo"] | undefined => {
  if (work.family === "class") {
    const nodes = [...work.lollipops].map(([id, l]) => ({
      id,
      label: l.label,
      parent: null,
      shape: "lollipop",
    }));

    return { nodes, edges: [] };
  }

  if (work.family !== "state") {
    return;
  }

  const { nodes, edges } = overviewMarkers(work, part);
  const move = (x: string): string => idOf(x);

  return {
    nodes,
    edges: edges.map((e) => ({
      ...e,
      source: move(e.source),
      target: move(e.target),
    })),
  };
};

export interface OverviewMarkers {
  nodes: GraphNode[];

  // Each transition by its ends as partition keys.
  edges: GraphEdge[];

  // The start and end transitions drawn merged onto a group, less the ones
  // drawn for them.
  merged: number;
}

// The start and end markers an overview draws, with their transitions: one
// from a marker to a kept state for each written, and one from a marker to a
// group for all the marker's transitions into the group's members, labelled
// only when every one of them carries that label. The group's detail draws
// each one as written, so the merge is presentation only.
export const overviewMarkers = (work: WorkGraph, part: Partition): OverviewMarkers => {
  const nodes = work.markers.filter((m) => m.parent === null || !part.regionOf.has(m.parent));
  const kept = new Set(nodes.map((m) => m.id));
  const all = markerIds(work);
  const buckets = new Map<string, GraphEdge[]>();

  for (const e of work.markerEdges) {
    const marker = all.has(e.source) ? e.source : e.target;

    if (!kept.has(marker)) {
      continue;
    }

    const move = (x: string): string => (x === marker ? x : over(part, x));
    const edge = { ...e, source: move(e.source), target: move(e.target) };
    const grouped = isGroupKey(edge.source) || isGroupKey(edge.target);
    const key = grouped ? `${edge.source}\u0000${edge.target}` : edgeKey(edge);

    buckets.set(key, [...(buckets.get(key) ?? []), edge]);
  }

  let merged = 0;
  const edges = [...buckets.values()].map((bucket) => {
    const [first, ...rest] = bucket as [GraphEdge, ...GraphEdge[]];

    if (!(isGroupKey(first.source) || isGroupKey(first.target))) {
      return first;
    }

    merged += rest.length;

    const { label: _label, ...bare } = first;

    return bucket.every((e) => e.label === first.label) ? first : bare;
  });

  return {
    nodes,
    edges: sortEdges(edges).map((e, i) => ({ ...e, id: `p${i}` })),
    merged,
  };
};

// The id of the overview node a partition key stands for.
const idOfKey =
  (part: Partition, groups: SplitGroup[]) =>
  (k: string): string =>
    isGroupKey(k) ? (groups[part.groupOf.get(k.slice(1)) ?? -1]?.id ?? k) : k;

export const overviewGraph = (
  work: WorkGraph,
  part: Partition,
  groups: SplitGroup[],
): { graph: DiagramGraph; covers: Record<string, string[]> } => {
  const idOf = idOfKey(part, groups);
  const kept = work.ids.filter((id) => !part.groupOf.has(id)).map((id) => work.nodes.get(id) as WNode);
  const pseudo = overviewPseudo(work, part, idOf);
  const edges = quotientEdges(work, part)
    .map((e) => qEdge(e, idOf))
    .sort(byOverviewEdge)
    .map((e, i) => ({ ...e, id: `o${i}` }));
  const graph: DiagramGraph = {
    diagram_type: work.type,
    nodes: [
      ...kept.map((n) => graphNode(n, n.owns ?? n.parent, false)),
      ...groups.map((g) => ({
        id: g.id,
        label: g.label,
        parent: g.parent,
        ...(work.family === "flowchart" ? { shape: "subroutine" } : {}),
        ...(g.markdown ? { markdown: true as const } : {}),
      })),
    ],
    edges: edges.map(({ covers: _covers, ...e }) => e),
    subgraphs: remainingRegions(work, part).map((r) => regionNode(work, r, work.regions.get(r)?.parent ?? null)),
    ...(pseudo ? { pseudo } : {}),
  };

  return {
    graph,
    covers: Object.fromEntries(edges.map((e) => [e.id, e.covers])),
  };
};

const detailPseudo = (work: WorkGraph, view: DetailView): DiagramGraph["pseudo"] | undefined => {
  if (work.family === "state") {
    return { nodes: view.markers, edges: view.markerEdges };
  }

  if (work.family !== "class") {
    return;
  }

  const ends = new Set(view.edges.flatMap((e) => [e.source, e.target]));
  const nodes = [...work.lollipops]
    .filter(([id]) => ends.has(id))
    .map(([id, l]) => ({
      id,
      label: l.label,
      parent: null,
      shape: "lollipop",
    }));

  return { nodes, edges: [] };
};

// A box of stubs (SLOP-0038): in a flowchart detail, the stubs for two or more
// members of one other group, drawn inside one subgraph showing the label
// that group shows, each stub showing its member's own label. A group standing
// for one author region whole (soleRegion) is boxed as that region, so an
// edge to the region meets the box; any other group's box draws no edge.
export interface Box {
  id: string;

  // The region the box stands for, or the id of the group it stands for.
  endpoint: string;
  label: string;
  markdown?: true;

  // The stubs it holds, each standing for a member of its group.
  inner: string[];
}

// A detail's stubs by the group each stands in: for a member or a region
// of that group, or for the group whole.
const stubsByGroup = (part: Partition, view: DetailView): Map<string, Stub[]> => {
  const byGroup = new Map<string, Stub[]>();

  for (const s of view.stubs) {
    const k = isGroupKey(s.endpoint) ? s.endpoint : over(part, s.endpoint);

    if (isGroupKey(k)) {
      byGroup.set(k, [...(byGroup.get(k) ?? []), s]);
    }
  }

  return byGroup;
};

// The box for one group's stubs, or null. A group is boxed only when every
// stub for it stands for a member or for the region it stands for whole,
// one member at least, each shows its plain text, and each member's label
// names one member.
const boxFor = (
  a: { labels: LabelContext; config: ThresholdConfig },
  k: string,
  stubs: Stub[],
  texts: Map<string, StubText>,
): (Omit<Box, "id"> & { on?: string }) | null => {
  const { work, part } = a.labels;
  const g = groupOfKey(part, k);
  const shown = a.labels.groups.get(k);

  if (!(g && shown) || stubs.length < 2) {
    return null;
  }

  const region = soleRegion(work, g);
  const inner = stubs.filter((s) => work.nodes.has(s.endpoint));
  const onRegion = stubs.filter((s) => s.endpoint === region);
  const plain = stubs.every((s) => texts.get(s.id)?.label === memberText(a.labels, s.endpoint));
  const labels = g.members.map((m) => endpointLabel(work, m));
  const named = inner.every((s) => labels.filter((l) => l === endpointLabel(work, s.endpoint)).length === 1);

  if (inner.length + onRegion.length !== stubs.length || inner.length === 0 || !(plain && named)) {
    return null;
  }

  return {
    endpoint: region ?? shown.id,
    label: shown.label,
    ...(shown.markdown ? { markdown: shown.markdown } : {}),
    inner: inner.map((s) => s.id),
    ...(onRegion[0] ? { on: onRegion[0].id } : {}),
  };
};

// The boxes a detail may draw, most stubs first, each taking the id of the
// stub for its region when it has one.
const boxChoices = (
  a: { labels: LabelContext; config: ThresholdConfig },
  view: DetailView,
  texts: Map<string, StubText>,
): Box[] => {
  const { work, part } = a.labels;

  if (work.family !== "flowchart") {
    return [];
  }

  const next = idMaker(new Set([...usedIds(work), ...view.stubs.map((s) => s.id)]), "s");

  return [...stubsByGroup(part, view)]
    .sort((x, y) => byText(x[0], y[0]))
    .flatMap(([k, stubs]) => {
      const box = boxFor(a, k, stubs, texts);

      if (!box) {
        return [];
      }

      const { on, ...rest } = box;

      return [{ id: on ?? next(), ...rest }];
    })
    .sort((x, y) => y.inner.length - x.inner.length);
};

// A detail's shape with its boxes: a box standing for a region's stub is a
// subgraph instead of a node, and every box is a subgraph at the top level.
export const boxedShape = (work: WorkGraph, view: DetailView, boxes: readonly Box[]): Shape => {
  const shape = detailShape(work, view);
  const stubIds = new Set(view.stubs.map((s) => s.id));

  return {
    nodes: shape.nodes - boxes.filter((b) => stubIds.has(b.id)).length,
    edges: shape.edges,
    subgraphs: shape.subgraphs + boxes.length,
    depth: boxes.length > 0 ? Math.max(shape.depth, 1) : shape.depth,
  };
};

// The boxes a detail draws: each, most stubs first, while the detail still
// meets the target with it.
export const boxesOf = (
  a: { labels: LabelContext; config: ThresholdConfig },
  view: DetailView,
  texts: Map<string, StubText>,
): Box[] => {
  const kept: Box[] = [];

  for (const b of boxChoices(a, view, texts)) {
    const shape = boxedShape(a.labels.work, view, [...kept, b]);

    if (meets(shape.nodes, scoreOf(shape, 0, a.config), a.config)) {
      kept.push(b);
    }
  }

  return kept;
};

// What a detail draws beside its view: each stub's text, whether members
// draw their rows, and its boxes of stubs.
interface Drawn {
  texts: Map<string, StubText>;
  rows: boolean;
  boxes: readonly Box[];
}

export const detailGraph = (work: WorkGraph, view: DetailView, { texts, rows, boxes }: Drawn): DiagramGraph => {
  const drawn = new Set(view.regions);
  const inDrawn = (p: string | null | undefined): string | null => (p && drawn.has(p) ? p : null);
  const pseudo = detailPseudo(work, view);
  const boxOf = new Map(boxes.flatMap((b) => b.inner.map((id) => [id, b.id] as const)));
  const boxIds = new Set(boxes.map((b) => b.id));
  const endOf = new Map(view.stubs.map((s) => [s.id, s.endpoint]));

  return {
    diagram_type: work.type,
    nodes: [
      ...view.members.map((id) => {
        const n = work.nodes.get(id) as WNode;

        return graphNode(n, inDrawn(n.owns ?? n.parent), rows);
      }),
      ...view.stubs
        .filter((s) => !boxIds.has(s.id))
        .map((s) => {
          const text = texts.get(s.id);
          const box = boxOf.get(s.id);
          const end = endOf.get(s.id) ?? s.id;

          return {
            id: s.id,
            label: box === undefined ? (text?.label ?? s.id) : endpointLabel(work, end),
            parent: box ?? null,
            ...(work.family === "flowchart" ? { shape: "stadium" } : {}),
            ...(text?.markdown ? { markdown: true as const } : {}),
          };
        }),
    ],
    edges: sortEdges(view.edges),
    subgraphs: [
      ...view.regions.map((r) => regionNode(work, r, inDrawn(work.regions.get(r)?.parent))),
      ...boxes.map((b) => ({
        id: b.id,
        label: b.label,
        parent: null,
        ...(b.markdown ? { markdown: b.markdown } : {}),
      })),
    ],
    ...(pseudo ? { pseudo } : {}),
  };
};
