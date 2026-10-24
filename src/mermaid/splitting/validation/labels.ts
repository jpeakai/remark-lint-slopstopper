import type { WorkGraph } from "../graph/model.ts";
import {
  fanOf,
  qualifiedLabel,
  spanOf,
  wholeNaming,
} from "../labels/groups.ts";
import {
  FAN_LISTED,
  fanLabel,
  groupLabels,
  LISTED,
  listedOthers,
  rangeLabel,
  shorten,
  spanLabel,
} from "../labels/text.ts";
import {
  type Build,
  isGroupKey,
  partFromGroups,
  type SplitGroup,
} from "../planning/state.ts";

type Violations = string[];

const regionLabels = (work: WorkGraph, g: SplitGroup): string[] =>
  g.regions
    .map((r) => work.regions.get(r)?.label ?? "")
    .filter((l) => l !== "");

// The labels of the regions a group folds whose parent the group node sits
// in, each qualified by that parent's label (group-naming.ts qualifiedLabel).
const qualifiedLabels = (work: WorkGraph, g: SplitGroup): string[] =>
  g.regions
    .filter((r) => (work.regions.get(r)?.parent ?? null) === g.parent)
    .flatMap((r) => qualifiedLabel(work, r) ?? []);

// 4. A group label is an author label (a folded region's label, alone or,
// never cut, qualified by the region around it), a member's label, the range of its
// members' labels, or the family or lane label of its members (label.ts), shown cut by the
// one rule in label.ts, then " (+N)", N counting the members it does not
// name, and the group's id when the label is taken. No two groups show one
// label, and no group shows a node's label.
// Where a group's base label may come from, each recomputed from the data.
const sourcesOf = (build: Build, g: SplitGroup) => {
  const { plan, work } = build;
  const memberLabels = (x: SplitGroup): string[] =>
    x.members.map((m) => work.nodes.get(m)?.label ?? m);
  const base = g.labelBase;
  const hidden = plan.groups.filter((x) => x !== g).flatMap(memberLabels);
  const plain =
    regionLabels(work, g).includes(base) || memberLabels(g).includes(base);
  const naming = wholeNaming(work, g);
  return {
    range: base === rangeLabel(memberLabels(g), hidden),
    plain,
    qualified:
      !plain &&
      qualifiedLabels(work, g).includes(base) &&
      shorten(base) === base,
    whole:
      !plain &&
      (base === naming.family ||
        base === naming.lane ||
        base === fanName(build, g)) &&
      !g.markdown,
    spanned: base === spanName(work, g),
  };
};

const hiddenCounts = (
  sources: ReturnType<typeof sourcesOf>,
  members: number,
): number[] => {
  if (sources.range || sources.spanned) return [members - 2];
  return sources.qualified || sources.whole
    ? [members]
    : [members, members - 1];
};

const groupLabelViolations = (build: Build, g: SplitGroup): Violations => {
  const out: Violations = [];
  const [base, n] = [g.labelBase, g.hidden];
  if (
    !groupLabels(
      { base, n, markdown: g.markdown, pair: g.paired },
      g.id,
    ).includes(g.label)
  )
    out.push(`4: group ${g.id} label is not its parts`);
  if (g.paired !== undefined) return [...out, ...pairViolations(build, g)];
  const sources = sourcesOf(build, g);
  const { range, plain, qualified, whole, spanned } = sources;
  if (g.spanned !== undefined && !spanned)
    out.push(
      `4: group ${g.id} span label "${base}" is not its members' entry and exit`,
    );
  if (!(range || plain || qualified || whole || spanned))
    out.push(`4: group ${g.id} label "${base}" is not from the data`);
  const counts = hiddenCounts(sources, g.members.length);
  if (!counts.includes(n))
    out.push(`4: group ${g.id} counts ${n} hidden members`);
  return out;
};

// A pair or list label (label.ts listedOthers): a group of two or three
// members, or a group of leaves hanging from one overview node within
// FAN_LISTED, named after one whole and showing the others' labels,
// recomputed from the members, in place of the count, N being 0.
const pairViolations = (build: Build, g: SplitGroup): Violations => {
  const labels = g.members.map((m) => build.work.nodes.get(m)?.label ?? m);
  const others = listedOthers(
    g.labelBase,
    labels,
    fanAt(build, g) ? FAN_LISTED : LISTED,
  );
  const markdown =
    g.markdown || g.members.some((m) => build.work.nodes.get(m)?.markdown);
  const exact =
    others !== null &&
    others === g.paired &&
    `${g.labelBase} (+${others})` === g.label;
  return exact && g.hidden === 0 && !markdown
    ? []
    : [`4: group ${g.id} pair label "${g.label}" is not its members'`];
};

// The span label a group may show (label.ts spanLabel), recomputed from the
// members' entry and exit, for a group with no markdown member.
const spanName = (work: WorkGraph, g: SplitGroup): string | null => {
  const ends = spanOf(work, g);
  const [a, b] = ends
    ? [work.nodes.get(ends.entry), work.nodes.get(ends.exit)]
    : [undefined, undefined];
  return a && b && !a.markdown && !b.markdown && !g.markdown
    ? spanLabel(a.label, b.label)
    : null;
};

// The overview node a group of leaves hangs from, recomputed from the plan's
// groups (group-naming.ts fanOf), or null.
const fanAt = (
  build: Build,
  g: SplitGroup,
): { node: string; out: boolean } | null => {
  const part = partFromGroups(build.plan.groups);
  const group = part.groups[part.groupOf.get(g.members[0] ?? "") ?? -1];
  return group ? fanOf(build.work, part, group) : null;
};

// The fan label a group of leaves may show (label.ts fanLabel), from the name
// the node they hang from shows: a kept node's label, or a group's base.
const fanName = (build: Build, g: SplitGroup): string | null => {
  const fan = fanAt(build, g);
  if (!fan) return null;
  const other = isGroupKey(fan.node)
    ? build.plan.groups.find((x) => x.members[0] === fan.node.slice(1))
    : undefined;
  const name = isGroupKey(fan.node)
    ? other?.labelBase
    : (build.work.nodes.get(fan.node)?.label ?? fan.node);
  return name === undefined ? null : fanLabel(name, fan.out);
};

export const checkLabels = (build: Build): Violations => {
  const { plan, work } = build;
  const out: Violations = plan.groups.flatMap((g) =>
    groupLabelViolations(build, g),
  );
  const labels = plan.groups.map((g) => g.label);
  const nodeLabels = new Set([...work.nodes.values()].map((n) => n.label));
  if (new Set(labels).size !== labels.length)
    out.push("4: two groups show one label");
  for (const l of labels)
    if (nodeLabels.has(l))
      out.push(`4: group label "${l}" is also a node's label`);
  return out;
};
