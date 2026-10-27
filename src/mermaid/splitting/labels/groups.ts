import type { GraphEdge } from "../../parsing/graph.ts";
import { homeOf, regionWithin, type WorkGraph } from "../graph/model.ts";
import { byNatural } from "../graph/order.ts";
import { type Group, groupOfKey, keyOf, over, type Partition } from "../planning/state.ts";
import { UNDIRECTED_KINDS } from "../projection/quotient.ts";
import { byCrossing, chainEntries, chainsOf, isLookup, rankedMembers } from "./ranking.ts";
import { FAN_LISTED, familyLabel, ID_LEAD, LISTED, laneLabel, listedOthers, rangeLabel, spanLabel } from "./text.ts";

export const regionRoots = (work: WorkGraph, regions: readonly string[]): string[] => {
  const inSet = new Set(regions);

  return regions.filter((r) => !inSet.has(work.regions.get(r)?.parent ?? ""));
};

// The author region a group stands for whole: its one outermost folded
// region, when every member sits inside it. Null for any other group.
export const soleRegion = (work: WorkGraph, g: Pick<Group, "members" | "regions">): string | null => {
  const roots = regionRoots(work, g.regions);
  const root = roots.length === 1 ? roots[0] : undefined;

  return root !== undefined && g.members.every((m) => regionWithin(work, homeOf(work, m), root)) ? root : null;
};

export interface LabelParts {
  base: string;
  n: number;
  markdown?: true;

  // A region's label followed by the label of the region around it, in
  // brackets, which names it apart from a region of the same label elsewhere.
  qualified?: true;

  // The other member's label a pair label shows in place of the count.
  pair?: string;

  // Whether the label names the member a flowchart group's flow enters at and
  // the one it leaves from (text.ts spanLabel).
  span?: true;
}

// A region's label qualified by the label of the region around it, as
// "Public subnets (us-east-1)": null when either is empty or markdown, or the
// region sits at the top level.
export const qualifiedLabel = (work: WorkGraph, region: string): string | null => {
  const r = work.regions.get(region);
  const p = r?.parent ? work.regions.get(r.parent) : undefined;

  if (!(r && p) || r.owner || p.owner || r.markdown || p.markdown || r.label === "" || p.label === "") {
    return null;
  }

  return `${r.label} (${p.label})`;
};

const markdownOf = (x: { markdown?: true } | undefined): { markdown?: true } => (x?.markdown ? { markdown: true } : {});

// The labels a group may carry, best first. A group folded from one author
// region carries that region's label; otherwise the label of a member: the
// group's head (a decision region's decision, an aggregate's root) first, then
// the named one. An aggregate whose root is a lookup is named after the
// member with the most edges crossing its boundary instead. A range of the
// members' labels, when given, comes after the region and the head, and the
// members may be taken in natural order of their labels instead. N counts the
// members the label does not already name.
// The labels a group folding one author region whole may take from it: the
// region's label, then that label qualified by the region around it.
const regionChoices = (work: WorkGraph, g: Group): LabelParts[] => {
  const root = soleRegion(work, g);
  const region = root === null ? undefined : work.regions.get(root);

  if (!(root !== null && region)) {
    return [];
  }

  const qualified = qualifiedLabel(work, root);

  return [
    {
      base: region.label,
      n: g.members.length - (region.owner ? 1 : 0),
      ...markdownOf(region),
    },
    ...(qualified === null ? [] : [{ base: qualified, n: g.members.length, qualified: true as const }]),
  ];
};

// How a group may be named beyond its region, head and members: a range of
// its members' labels, its members taken by label, and a label naming a whole
// dotted family or twin chains by their stages (text.ts familyLabel and
// laneLabel), each null when it does not apply.
export interface Naming {
  range: string | null;
  byLabel: boolean;
  family?: string | null;
  lane?: string | null;
  fan?: string | null;

  // Whether the group is a group of leaves hanging from one overview node
  // (fanOf), whose list label may name every member (text.ts FAN_LISTED).
  fanList?: boolean;
}

const labelRanking = (work: WorkGraph, group: Group, byLabel: boolean, lookup: boolean): string[] => {
  const labelOf = (id: string): string => work.nodes.get(id)?.label ?? id;

  if (byLabel) {
    return [...group.members].sort((a, b) => byNatural(labelOf(a), labelOf(b)) || byNatural(a, b));
  }

  return lookup ? byCrossing(work, group.members) : rankedMembers(work, group);
};

export const labelChoices = (
  work: WorkGraph,
  g: Group,
  naming: Naming = { range: null, byLabel: false },
): LabelParts[] => {
  const { range } = naming;
  const fromRegion = regionChoices(work, g);
  const lookup = g.tier === "T4" && g.head !== undefined && isLookup(work, g.head, g.members);
  const ranked = labelRanking(work, g, naming.byLabel, lookup);
  const head = g.head !== undefined && !lookup && ranked.includes(g.head) ? [g.head] : [];
  const label = (m: string): LabelParts => {
    const node = work.nodes.get(m);

    return {
      base: node?.label ?? m,
      n: g.members.length - 1,
      ...markdownOf(node),
    };
  };

  const spanned = spanChoice(work, g);
  const fromRange = [range, naming.fan].flatMap((b, i) =>
    b ? [{ base: b, n: i === 0 ? g.members.length - 2 : g.members.length }] : [],
  );
  const whole = [naming.family, naming.lane].flatMap((b) => (b ? [{ base: b, n: g.members.length }] : []));

  // A run a range or a whole family or lane names reads as that run, so a
  // group of three takes a list label only when none applies (SLOP-0035).
  // A group of leaves takes its list first, since it names every member (SLOP-0035).
  const run = g.members.length > 2 && (range !== null || whole.length > 0) && naming.fanList !== true;

  return [
    ...fromRegion,
    ...(fromRegion.length === 0 && !run
      ? pairChoices(work, g, [...head, ...ranked], naming.fanList ? FAN_LISTED : LISTED)
      : []),
    ...head.map(label),
    ...whole,
    ...fromRange,
    ...spanned,
    ...ranked.filter((m) => !head.includes(m)).map(label),
  ];
};

// The pair label a group of two members may take: named after the first of
// its members in the order given, the other's label in place of the count
// (text.ts pairLabel). None for any other group or a markdown member.
// A group of three takes the list label the same way, the other two in
// natural order (text.ts listedOthers, SLOP-0035), and a group of leaves
// within FAN_LISTED however many it holds (SLOP-0035).
const pairChoices = (work: WorkGraph, g: Group, order: readonly string[], limits = LISTED): LabelParts[] => {
  const [named] = order;
  const nodes = g.members.map((m) => work.nodes.get(m));
  const a = named === undefined ? undefined : work.nodes.get(named);

  if (!a || nodes.some((n) => n === undefined || n.markdown)) {
    return [];
  }

  const pair = listedOthers(
    a.label,
    nodes.map((n) => n?.label ?? ""),
    limits,
  );

  return pair === null ? [] : [{ base: a.label, n: 0, pair }];
};

// The one member a flowchart group's flow enters at and the one it leaves
// from, by directed edges: the member every edge from outside the group
// reaches, else its one member no edge reaches; and the member every edge to
// outside the group leaves, else its one member no edge leaves. Null for
// fewer than three members, a group folding a region, or when either is not
// one member, or both are one (SLOP-0035).
export const spanOf = (
  work: WorkGraph,
  g: Pick<Group, "members" | "regions">,
): { entry: string; exit: string } | null => {
  if (work.family !== "flowchart" || g.members.length < 3 || g.regions.length > 0) {
    return null;
  }

  const inside = new Set(g.members);
  const edges = work.edges.filter((e) => e.source !== e.target);
  const one = (crossing: string[], open: () => string[]): string | null => {
    const set = [...new Set(crossing.length > 0 ? crossing : open())];

    return set.length === 1 ? (set[0] ?? null) : null;
  };

  const entry = one(
    edges.filter((e) => inside.has(e.target) && !inside.has(e.source)).map((e) => e.target),
    () => g.members.filter((m) => !edges.some((e) => e.target === m)),
  );
  const exit = one(
    edges.filter((e) => inside.has(e.source) && !inside.has(e.target)).map((e) => e.source),
    () => g.members.filter((m) => !edges.some((e) => e.source === m)),
  );

  return entry !== null && exit !== null && entry !== exit ? { entry, exit } : null;
};

// The span label a group with no head may take (text.ts spanLabel),
// counting the members it does not name.
const spanChoice = (work: WorkGraph, g: Group): LabelParts[] => {
  const ends = g.head === undefined ? spanOf(work, g) : null;
  const [a, b] = ends ? [work.nodes.get(ends.entry), work.nodes.get(ends.exit)] : [undefined, undefined];
  const base = a && b && !a.markdown && !b.markdown ? spanLabel(a.label, b.label) : null;

  return base === null ? [] : [{ base, n: g.members.length - 2, span: true }];
};

// The one overview node every member of a group of leaves hangs from, with
// the way the leaves' edges run (true when out of that node), when the group
// holds every leaf hanging from it that way: two members or more, each with
// one directed edge, no start or end transition, in a flowchart or
// stateDiagram, and that node no group of leaves itself (text.ts fanLabel).
const edgesAtNodes = (work: WorkGraph): Map<string, GraphEdge[]> => {
  const edges = new Map<string, GraphEdge[]>();

  for (const edge of work.edges.filter((item) => item.source !== item.target)) {
    for (const end of [edge.source, edge.target]) {
      edges.set(end, [...(edges.get(end) ?? []), edge]);
    }
  }

  return edges;
};

export const fanOf = (work: WorkGraph, part: Partition, g: Group): { node: string; out: boolean } | null => {
  if ((work.family !== "flowchart" && work.family !== "state") || g.members.length < 2) {
    return null;
  }

  const edgesOf = edgesAtNodes(work);
  const marked = new Set(work.markerEdges.flatMap((e) => [e.source, e.target]));
  const leaf = (id: string): GraphEdge | null => {
    const es = edgesOf.get(id) ?? [];
    const [e] = es;

    return es.length === 1 && e && !marked.has(id) && !UNDIRECTED_KINDS.has(e.kind ?? "") && work.nodes.has(id)
      ? e
      : null;
  };

  const key = keyOf(g);
  const hangs = (id: string): { node: string; out: boolean } | null => {
    const e = leaf(id);

    if (!e) {
      return null;
    }

    const out = e.target === id;

    return { node: over(part, out ? e.source : e.target), out };
  };

  const ends = g.members.map(hangs);
  const [first] = ends;

  if (!first || first.node === key || ends.some((x) => !x || x.node !== first.node || x.out !== first.out)) {
    return null;
  }

  const inside = new Set(g.members);
  const more = work.ids.some((id) => {
    const h = inside.has(id) ? null : hangs(id);

    return h !== null && h.node === first.node && h.out === first.out;
  });
  const leaves = groupOfKey(part, first.node)?.members.every((m) => leaf(m) !== null) ?? false;

  return more || leaves ? null : first;
};

const labelOf = (work: WorkGraph, id: string): string => work.nodes.get(id)?.label ?? id;

// The family label and the lane label a group may take , from the
// diagram's own labels: a family against every node outside the group.
export const wholeNaming = (
  work: WorkGraph,
  g: Pick<Group, "members">,
): { family: string | null; lane: string | null } => {
  const inside = new Set(g.members);
  const outside = [...work.nodes.values()].filter((n) => !inside.has(n.id)).map((n) => n.label);
  const chains = chainsOf(work, g.members);

  return {
    family: familyLabel(
      g.members.map((m) => labelOf(work, m)),
      outside,
    ),
    lane: chains === null ? null : laneLabel(chains.map((c) => c.map((m) => labelOf(work, m)))),
  };
};

// How a group may be named beyond its region and head: the dotted family it
// holds whole, or its twin chains by their stages; the range of its
// members' labels, for twins and sibling leaves or for members whose labels
// all lead with an id, when no other group's member falls in it; and, for
// id-led labels, its members in natural order of their labels, so a group
// with no honest range is named by its first id.
export const groupNaming = (work: WorkGraph, part: Partition, g: Group): Naming => {
  const labels = g.members.map((m) => labelOf(work, m));
  const markdown = g.members.some((m) => work.nodes.get(m)?.markdown);
  const whole = {
    ...(markdown ? { family: null, lane: null } : wholeNaming(work, g)),
    fanList: fanOf(work, part, g) !== null,
  };
  const idLed = labels.every((l) => ID_LEAD.test(l));

  // Twin chains are named by an entry, so a range never spans two stages of them.
  const runs = (g.reason === "twins" || g.reason === "sibling leaves") && chainEntries(work, g.members) === null;

  if (markdown || !(runs || idLed)) {
    return { range: null, byLabel: false, ...whole };
  }

  const hidden = part.groups.filter((x) => x !== g).flatMap((x) => x.members.map((m) => labelOf(work, m)));

  return { range: rangeLabel(labels, hidden), byLabel: idLed, ...whole };
};
