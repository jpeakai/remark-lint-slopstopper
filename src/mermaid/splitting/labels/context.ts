import { endpointLabel, type WorkGraph } from "../graph/model.ts";
import { isGroupKey, over, type Partition } from "../planning/state.ts";
import type { Stub } from "../projection/detail.ts";
import { MARKUP, rangeEnds, spanEnds } from "./text.ts";

// Interpret displayed labels independently of the code that assigns them.

// Whether a stub for a member of a group shows its own label alone: the
// group shows every member's label in a pair or list label, the member is
// the entry or the exit a span label names (MJL-0039), or the first or the
// last a range label names (MJL-0041), or the member is the one the group is
// named after, so the group's shown label leads with the member's own label,
// uncut (MJL-0038).
export const ownSuffices = (
  g: {
    label: string;
    base: string;
    markdown?: true;
    paired?: unknown;
    spanned?: unknown;
  },
  own: string,
  markdown: boolean,
): boolean =>
  g.paired !== undefined ||
  (g.spanned !== undefined && !markdown && spanEnds(g.base).includes(own)) ||
  (!(markdown || g.markdown) &&
    rangeEnds(g.base).includes(own) &&
    g.label.startsWith(`${g.base} (+`)) ||
  (!(markdown || g.markdown) &&
    g.base === own &&
    g.label.startsWith(`${own} (+`));

// What a reader of a plan has to go on when a stub's text names a node: every
// label the diagram's own nodes, regions and interfaces show, each group's
// shown label and whole author label, and which group folds a node.
export interface Reader {
  literal: Map<string, string[]>;
  groups: Array<{ id: string; label: string; base: string; markdown?: true }>;
  groupOf: (id: string) => string | undefined;
}

export const readerOf = (
  work: WorkGraph,
  groups: Reader["groups"],
  groupOf: Reader["groupOf"],
): Reader => {
  const literal = new Map<string, string[]>();
  const add = (label: string, id: string): void => {
    literal.set(label, [...(literal.get(label) ?? []), id]);
  };
  for (const n of work.nodes.values()) add(n.label, n.id);
  // A composite state's box shows its state's name, so only the state reads.
  for (const r of work.regions.values())
    if (!r.owner && r.label !== "") add(r.label, r.id);
  for (const [id, l] of work.lollipops) add(l.label, id);
  return { literal, groups, groupOf };
};

// What joins a member's label to the label its group shows, in a stub for
// that member: the text reads "PAYMENT_METHOD (in CUSTOMER (+2))".
export const IN = " (in ";

// What joins a whole group's shown label to the member a stub's edges leave.
export const FROM = " from ";

// The members of group gid a text names after its shown label and FROM: none
// unless the text is that form.
export const fromMembers = (r: Reader, text: string, gid: string): string[] => {
  const g = r.groups.find((x) => x.id === gid);
  if (!(g && text.startsWith(`${g.label}${FROM}`))) return [];
  return (r.literal.get(text.slice(g.label.length + FROM.length)) ?? []).filter(
    (id) => r.groupOf(id) === gid,
  );
};
const TAG = /^(.*) \[([^\]]+)\]$/s;

// Every node or group a stub's text can be read as naming, by each form the
// plan writes: a label as it is, a group's shown label, a label with IN, the
// shown label of the group folding it and a closing bracket, a group's shown
// label with FROM and one of its members' labels, and any of these followed
// by " [id]" naming one of its readings. A stub is drawn only with a
// text that has exactly one reading.
export const readingsOf = (r: Reader, text: string): Set<string> => {
  const fromGroups = r.groups
    .filter((g) => fromMembers(r, text, g.id).length > 0)
    .map((g) => g.id);
  const out = new Set<string>([...(r.literal.get(text) ?? []), ...fromGroups]);
  for (const g of r.groups.filter((group) => group.label === text))
    out.add(g.id);
  const tag = TAG.exec(text);
  if (tag && readingsOf(r, tag[1] ?? "").has(tag[2] ?? ""))
    out.add(tag[2] ?? "");
  const inGroup = (
    own: string,
    fits: (g: Reader["groups"][number]) => boolean,
  ): void => {
    for (const id of r.literal.get(own) ?? []) {
      const g = r.groups.find((x) => x.id === r.groupOf(id));
      if (g && fits(g)) out.add(id);
    }
  };
  if (text.endsWith(")")) {
    for (let at = text.indexOf(IN); at >= 0; at = text.indexOf(IN, at + 1)) {
      const shown = text.slice(at + IN.length, -1);
      inGroup(text.slice(0, at), (g) => g.label === shown);
    }
  }
  return out;
};

// Assign unambiguous text to detail stubs using one prepared reader.

export interface StubText {
  label: string;
  markdown?: true;
  // The original id the stub stands for, or the id of the group it stands for.
  endpoint: string;
}

export interface LabelContext {
  work: WorkGraph;
  part: Partition;
  // Each group by its key in the partition: its id, its whole author label,
  // the label it shows, and whether that is a pair label.
  groups: Map<
    string,
    {
      id: string;
      base: string;
      label: string;
      markdown?: true;
      paired?: true;
      spanned?: true;
    }
  >;
}

const markdownOf = (work: WorkGraph, id: string): { markdown?: true } =>
  work.nodes.get(id)?.markdown || work.regions.get(id)?.markdown
    ? { markdown: true }
    : {};

// The text before any id is added: the node's label, then IN, the label its
// group shows and a closing bracket when it sits in a group; a whole group by
// its shown label. A member whose own label suffices (ownSuffices) is named
// by its own label alone.
const plainText = (ctx: LabelContext, endpoint: string): StubText => {
  if (isGroupKey(endpoint)) {
    const g = ctx.groups.get(endpoint);
    return {
      label: g?.label ?? endpoint,
      endpoint: g?.id ?? endpoint,
      ...(g?.markdown ? { markdown: true } : {}),
    };
  }
  const own = endpointLabel(ctx.work, endpoint);
  const g = ctx.groups.get(over(ctx.part, endpoint));
  const md = markdownOf(ctx.work, endpoint);
  const label =
    g === undefined || ownSuffices(g, own, md.markdown === true)
      ? own
      : `${own}${IN}${g.label})`;
  return { label, endpoint, ...md };
};

// A stub's text before any id is added (plainText).
export const memberText = (ctx: LabelContext, endpoint: string): string =>
  plainText(ctx, endpoint).label;

// The most " [id]" tags a stub's text takes before the plan gives up on it.
const MAX_TAGS = 3;

const contextReader = (ctx: LabelContext): Reader =>
  readerOf(ctx.work, [...ctx.groups.values()], (id) => {
    const key = over(ctx.part, id);
    return isGroupKey(key) ? ctx.groups.get(key)?.id : undefined;
  });

// Each stub's text: the plain text when it reads as its endpoint alone, else
// the text followed by " [id]", as often as it takes for one reading.
const stubTexts = (
  ctx: LabelContext,
  stubs: Stub[],
  reader: Reader,
): Map<string, StubText> => {
  return new Map(
    stubs.map((s) => {
      const text = plainText(ctx, s.endpoint);
      let label = text.label;
      for (let i = 0; i < MAX_TAGS; i++) {
        const read = readingsOf(reader, label);
        if (read.size === 1 && read.has(text.endpoint)) break;
        label = `${label} [${text.endpoint}]`;
      }
      return [s.id, { ...text, label }];
    }),
  );
};

// A stub for a whole group reads alike another stub when they show one text,
// or when the other stands for the member the group is named after ("ORDER"
// beside "ORDER (+6)"). Each such stub takes FROM and the label of
// the one member its edges leave, when that text has exactly the one reading
// and that member is not the namesake, which the group's label already names.
// Null when two stubs would still show one text.
const namedStubs = (
  { ctx, reader }: { ctx: LabelContext; reader: Reader },
  stubs: Stub[],
  texts: Map<string, StubText>,
  sourcesOf: (stub: string) => string[],
): Map<string, StubText> | null => {
  const count = new Map<string, number>();
  for (const t of texts.values())
    count.set(t.label, (count.get(t.label) ?? 0) + 1);
  const alike = (endpoint: string, label: string): boolean => {
    const base = ctx.groups.get(endpoint)?.base;
    return (
      (count.get(label) ?? 0) > 1 ||
      count.has(`${base}${IN}${label})`) ||
      (base !== undefined && count.has(base))
    );
  };
  const out = new Map(texts);
  const readableMember = (
    member: string,
    source: string,
    endpoint: string,
    label: string,
  ): boolean => {
    const node = ctx.work.nodes.get(source);
    const read = readingsOf(reader, label);
    return (
      node !== undefined &&
      !MARKUP.test(member) &&
      !node.markdown &&
      read.size === 1 &&
      read.has(endpoint)
    );
  };
  const namingSource = (s: Stub): { text: StubText; source: string } | null => {
    const t = texts.get(s.id);
    const [source, ...more] = sourcesOf(s.id);
    if (
      !(t && isGroupKey(s.endpoint) && alike(s.endpoint, t.label)) ||
      t.markdown ||
      !source ||
      more.length > 0
    )
      return null;
    return { text: t, source };
  };
  for (const s of stubs) {
    const candidate = namingSource(s);
    if (!candidate) continue;
    const { text: t, source } = candidate;
    const member = endpointLabel(ctx.work, source);
    // The namesake itself is what the group's label already names.
    if (member === ctx.groups.get(s.endpoint)?.base) continue;
    const label = `${t.label}${FROM}${member}`;
    if (!readableMember(member, source, t.endpoint, label)) continue;
    out.set(s.id, { ...t, label });
  }
  const labels = [...out.values()].map((t) => t.label);
  return new Set(labels).size === labels.length ? out : null;
};

// Qualification and source-member suffixes use the same possible readings.
export const labelStubs = (
  ctx: LabelContext,
  stubs: Stub[],
  sourcesOf: (stub: string) => string[],
): Map<string, StubText> => {
  const reader = contextReader(ctx);
  const texts = stubTexts(ctx, stubs, reader);
  return namedStubs({ ctx, reader }, stubs, texts, sourcesOf) ?? texts;
};
