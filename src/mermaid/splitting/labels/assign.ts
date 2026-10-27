import { idMaker, usedIds, type WorkGraph } from "../graph/model.ts";
import { type Group, isGroupKey, type Partition, type SplitGroup } from "../planning/state.ts";
import { fanOf, groupNaming, type LabelParts, labelChoices, type Naming } from "./groups.ts";
import { fanLabel, groupLabels, MAX_LISTED, shorten } from "./text.ts";

const agreedShape = (work: WorkGraph, g: Group): string | undefined => {
  const shapes = new Set(g.members.map((m) => work.nodes.get(m)?.shape));
  const [only] = [...shapes];

  return shapes.size === 1 ? only : undefined;
};

const labelOf = (work: WorkGraph, id: string): string => work.nodes.get(id)?.label ?? id;

// The labels a group may show, preferred first. A region's label qualified
// by the region around it comes first when another group is named after a
// region of the same label, so echoing regions read apart by where they sit
// rather than by an id; else it comes after the region's own label, before
// any label tagged with an id.
const optionsOf = (choices: LabelParts[], id: string, shared: boolean): Array<LabelParts & { label: string }> => {
  const all = choices.flatMap((c) => groupLabels(c, id).map((label) => ({ ...c, label })));

  // A qualified label is offered only whole: cut, it would hide where the region sits.
  const qualified = all.filter((o) => o.qualified && shorten(o.base) === o.base && !o.label.endsWith(`[${id}]`));

  if (qualified.length === 0) {
    return all;
  }

  const rest = all.filter((o) => !o.qualified);
  const plain = rest.filter((o) => o.base === choices[0]?.base && !o.label.endsWith(`[${id}]`));
  const others = rest.filter((o) => !plain.includes(o));

  return shared ? [...qualified, ...plain, ...others] : [...plain, ...qualified, ...others];
};

// Groups of two or three members folded alike, by tier and reason, take pair
// or list labels only when every one of them can, so groups folded alike read
// alike (SLOP-0033, SLOP-0035): the choice is dropped from all of them, and from
// a larger group of leaves folded alike that could list its members
// (SLOP-0035), otherwise.
const alikePairs = (part: Partition, choices: LabelParts[][]): LabelParts[][] => {
  const kind = (g: Group): string => `${g.tier}\u0000${g.reason}`;
  const blocked = new Set(
    part.groups
      .filter((g, i) => g.members.length <= MAX_LISTED && !(choices[i] ?? []).some((c) => c.pair !== undefined))
      .map(kind),
  );

  return choices.map((cs, i) => {
    const g = part.groups[i];

    return g && blocked.has(kind(g)) ? cs.filter((c) => c.pair === undefined) : cs;
  });
};

// The label a group of leaves hanging from one overview node may take from
// the label that node shows, once every other group is named (SLOP-0033).
const fanChoices = (
  work: WorkGraph,
  part: Partition,
  i: number,
  known: {
    namings: Naming[];
    choices: LabelParts[][];
    picks: Array<LabelParts | undefined>;
  },
): LabelParts[] => {
  const g = part.groups[i] as Group;
  const fan = fanOf(work, part, g);

  if (!fan) {
    return known.choices[i] ?? [];
  }

  const at = isGroupKey(fan.node) ? part.groupOf.get(fan.node.slice(1)) : undefined;
  const name = at === undefined ? labelOf(work, fan.node) : known.picks[at]?.base;
  const label = name === undefined ? null : fanLabel(name, fan.out);
  const naming = known.namings[i] ?? { range: null, byLabel: false };
  const paired = (known.choices[i] ?? []).some((c) => c.pair !== undefined);

  return labelChoices(work, g, { ...naming, fan: label }).filter((c) => paired || c.pair === undefined);
};

const splitGroupOf = (work: WorkGraph, g: Group, id: string, pick: (LabelParts & { label: string }) | undefined) => {
  const { base, n, markdown, label, pair, span } = pick ?? {
    base: "",
    n: 0,
    label: "",
  };
  const shape = agreedShape(work, g);

  return {
    id,
    label,
    labelBase: base,
    hidden: n,
    ...(pair !== undefined ? { paired: pair } : {}),
    ...(span ? { spanned: span } : {}),
    ...(markdown ? { markdown } : {}),
    members: g.members,
    regions: g.regions,
    parent: g.parent,
    tier: g.tier,
    reason: g.reason,
    ...(shape !== undefined ? { shape } : {}),
  };
};

// Each group's label: the first of its choices no original node, region or
// earlier group already shows, so a group never reads as another node. A
// group of leaves hanging from one overview node is named after the others,
// so its fan label takes the name that node shows.
export const groupsOf = (work: WorkGraph, part: Partition): SplitGroup[] => {
  const next = idMaker(usedIds(work), "g");
  const taken = new Set([...work.nodes.values()].map((n) => n.label));

  for (const r of work.regions.values()) {
    taken.add(r.label);
  }

  const namings = part.groups.map((g) => groupNaming(work, part, g));
  const choices = alikePairs(
    part,
    part.groups.map((g, i) => labelChoices(work, g, namings[i])),
  );
  const regionBase = (cs: LabelParts[]): string | undefined => (cs[1]?.qualified ? cs[0]?.base : undefined);
  const bases = choices.map(regionBase);
  const ids = part.groups.map(() => next());
  const picks: Array<(LabelParts & { label: string }) | undefined> = [];
  const pickFor = (i: number, mine: LabelParts[]): void => {
    const named = regionBase(mine);
    const shared = named !== undefined && bases.filter((b) => b === named).length > 1;
    const options = optionsOf(mine, ids[i] ?? "", shared);
    const pick = options.find((o) => !taken.has(o.label)) ?? options[0];

    taken.add(pick?.label ?? "");
    picks[i] = pick;
  };

  const leaves = part.groups.map((g) => fanOf(work, part, g) !== null);

  part.groups.forEach((_, i) => {
    if (!leaves[i]) {
      pickFor(i, choices[i] ?? []);
    }
  });
  part.groups.forEach((_, i) => {
    if (leaves[i]) {
      pickFor(i, fanChoices(work, part, i, { namings, choices, picks }));
    }
  });

  return part.groups.map((g, i) => splitGroupOf(work, g, ids[i] ?? "", picks[i]));
};
