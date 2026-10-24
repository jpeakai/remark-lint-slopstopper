import { byNatural } from "../graph/order.ts";

// Text grammar shared by label writers and readers. No graph or projection policy.

// Mermaid's parser stores entity names between internal marker characters.
// Restore source syntax for emission, or HTML syntax for text extraction.
export const sourceEntities = (s: string): string =>
  s.replaceAll("ﬂ°°", "#").replaceAll("ﬂ°", "#").replaceAll("¶ß", ";");
export const htmlEntities = (s: string): string =>
  s.replaceAll("ﬂ°°", "&#").replaceAll("ﬂ°", "&").replaceAll("¶ß", ";");

// The longest label a group node shows, in user-perceived characters.
export const LABEL_CAP = 40;

const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });

// The characters kept after the ellipsis, where labels in a series differ.
const TAIL = 12;

// A label cut to LABEL_CAP characters, its middle replaced by an ellipsis, so
// both its start and its end still show. Markup is never cut, since half a
// tag or half a markdown span reads back as other text.
export const shorten = (label: string, markdown?: true): string => {
  if (markdown || MARKUP.test(label)) return label;
  const chars = [...graphemes.segment(label)].map((s) => s.segment);
  if (chars.length <= LABEL_CAP) return label;
  const head = chars
    .slice(0, LABEL_CAP - TAIL - 1)
    .join("")
    .trimEnd();
  return `${head}…${chars.slice(-TAIL).join("").trimStart()}`;
};

// A range label: a group's first and last member labels in natural order,
// joined by a spaced ellipsis, which a cut label never shows. It names a run
// of interchangeable members as an index names a volume, so it is offered for
// twins and sibling leaves, and for members whose labels all lead with an id
// (DATA-0381, S10004, "10011 Wont Do"), where one member's label says little.
// It counts the members it does not name, two fewer than the group holds, and
// is offered only for three members or more, with no markup, within LABEL_CAP.
// A range must not mislead: no member of another group (hidden, so a reader
// would look for it here) has a label from the first to the last.
export const RANGE_SEPARATOR = " … ";

export const MARKUP = /[<&*_`#]/;

export const rangeLabel = (
  labels: readonly string[],
  hidden: readonly string[] = [],
): string | null => {
  const order = [...labels].sort(byNatural);
  const [first, last] = [order[0], order.at(-1)];
  if (
    labels.length < 3 ||
    first === undefined ||
    last === undefined ||
    first === last
  )
    return null;
  if (order.some((l) => MARKUP.test(l) || l.includes(RANGE_SEPARATOR)))
    return null;
  if (hidden.some((l) => byNatural(first, l) <= 0 && byNatural(l, last) <= 0))
    return null;
  const base = `${first}${RANGE_SEPARATOR}${last}`;
  return [...graphemes.segment(base)].length <= LABEL_CAP ? base : null;
};

// A label that leads with an id: up to five letters, an optional dash or
// underscore, then two digits or more, ending there or at a separator.
export const ID_LEAD = /^[A-Za-z]{0,5}[-_]?\d{2,}(?=$|[\s:._-])/;

// The dotted namespace leading a label, as "gold" in gold.daily_revenue:
// letters, digits and dashes from a letter, then a dot and a word character.
export const DOTTED = /^([A-Za-z][A-Za-z0-9-]*)\.[A-Za-z0-9_]/;

export const dottedFamily = (label: string): string | null =>
  DOTTED.exec(label.trim())?.[1] ?? null;

// A family label names a group holding a whole dotted family: three members or
// more, every one's label leading with one namespace, as gold.daily_revenue
// and gold.customer_ltv, and no node outside the group leading with it. It
// reads as the namespace and ".*", as "gold.*", and counts every member.
export const FAMILY_SUFFIX = ".*";

export const familyLabel = (
  labels: readonly string[],
  outside: readonly string[],
): string | null => {
  const families = new Set(labels.map(dottedFamily));
  const [family] = [...families];
  if (
    labels.length < 3 ||
    families.size !== 1 ||
    family === undefined ||
    family === null
  )
    return null;
  return outside.some((l) => dottedFamily(l) === family)
    ? null
    : `${family}${FAMILY_SUFFIX}`;
};

// A lane label names twin chains by their stages, as "Extract → bronze" for
// extracts each feeding the bronze table it lands in. Each chain holds its
// members' labels in flow order, and every chain is as long as the others,
// two members or more. A stage is named by the dotted namespace every label
// at that place leads with, else by the first word every one of them leads
// with, else by the two first words they lead with between them, in natural
// order and joined by a slash, as "Extract/Ingest" (MJL-0038), else shown as
// an ellipsis. At least one stage is named, and the label counts every member.
export const LANE_SEPARATOR = " → ";

const FIRST_WORD = /^(\p{L}[\p{L}\p{N}-]*)\s/u;

// What joins the two first words a stage of twin chains is named by.
export const WORD_SEPARATOR = "/";

// The two first words a place's labels lead with between them, in natural
// order and joined by WORD_SEPARATOR: null unless every label leads with a
// word and they lead with exactly two.
const twoWords = (words: Array<string | null>): string | null => {
  const set = [...new Set(words)];
  if (set.length !== 2 || set.some((w) => w === null)) return null;
  return (set as string[]).sort(byNatural).join(WORD_SEPARATOR);
};

// The word one label gives its place in a lane: its dotted namespace, else
// its first word, else null.
export const stageWord = (label: string): string | null =>
  dottedFamily(label) ?? FIRST_WORD.exec(label.trim())?.[1] ?? null;

export const laneLabel = (
  chains: readonly (readonly string[])[],
): string | null => {
  const length = chains[0]?.length ?? 0;
  if (
    chains.length < 2 ||
    length < 2 ||
    chains.some((c) => c.length !== length)
  )
    return null;
  const one = (xs: Array<string | null>): string | null => {
    const set = new Set(xs);
    const [x] = [...set];
    return set.size === 1 && x !== undefined ? x : null;
  };
  const stages = Array.from({ length }, (_, i) => {
    const labels = chains.map((c) => (c[i] ?? "").trim());
    const words = labels.map((l) => FIRST_WORD.exec(l)?.[1] ?? null);
    return one(labels.map(dottedFamily)) ?? one(words) ?? twoWords(words);
  });
  if (stages.every((s) => s === null)) return null;
  const base = stages.map((s) => s ?? "…").join(LANE_SEPARATOR);
  return [...graphemes.segment(base)].length <= LABEL_CAP ? base : null;
};

// A fan label names a group holding every leaf one overview node leads to,
// or every leaf leading to it, by that node's name and an ellipsis, as
// "Order service → …" for the external APIs an order service calls
// (MJL-0038), when their list label does not fit (MJL-0040). The name holds
// no markup and the label at most LABEL_CAP characters; it counts every
// member.
export const fanLabel = (name: string, out: boolean): string | null => {
  if (name.trim() === "" || MARKUP.test(name)) return null;
  const base = out ? `${name}${LANE_SEPARATOR}…` : `…${LANE_SEPARATOR}${name}`;
  return [...graphemes.segment(base)].length <= LABEL_CAP ? base : null;
};

// A span label names a flowchart group the flow enters at one member and
// leaves at another by those two members' labels, joined by LANE_SEPARATOR,
// as "git push to main → tsc --noEmit" for a run of setup steps (MJL-0039).
// Neither label holds markup, an arrow or an ellipsis, and the label holds at
// most LABEL_CAP characters. It counts the members it does not name, two
// fewer than the group holds.
export const spanLabel = (entry: string, exit: string): string | null => {
  if (entry === exit) return null;
  if (
    [entry, exit].some(
      (l) =>
        l.trim() === "" || l !== l.trim() || MARKUP.test(l) || /[→…]/.test(l),
    )
  )
    return null;
  const base = `${entry}${LANE_SEPARATOR}${exit}`;
  return [...graphemes.segment(base)].length <= LABEL_CAP ? base : null;
};

// A pair label names a group of two members by both, the one it is named
// after and then, in place of the count, the other's label after a plus, as
// "ROOM (+BUILDING)", so the overview hides no name (MJL-0038). Neither label
// holds markup or a bracket, the other is not a number, which the count
// would read as, and the whole label holds at most LABEL_CAP characters.
const NOT_PAIRED = /[()[\]<&*`#]|^\d+$/;

export const pairLabel = (
  named: string,
  other: string,
  cap = LABEL_CAP,
): string | null => {
  if (named === other || named.trim() === "" || other.trim() === "")
    return null;
  if ([named, other].some((l) => NOT_PAIRED.test(l) || l !== l.trim()))
    return null;
  const label = `${named} (+${other})`;
  return [...graphemes.segment(label)].length <= cap ? label : null;
};

// The most members a group names one by one in place of its count: a group
// of three shows the label it is named after, then " (+", the other two
// labels in natural order joined by LIST_SEPARATOR, and ")", as
// "ADDRESS (+CITY, COUNTRY)" (MJL-0039). Neither other label holds a comma,
// which would read as two names, and each meets the pair rules.
export const MAX_LISTED = 3;
export const LIST_SEPARATOR = ", ";

// How many members a list label may name and how long it may be. A group of
// leaves hanging from one overview node (group-naming.ts fanOf) holds nothing but
// those leaves, so its list names every member however many, within twice
// LABEL_CAP, as "Carrier quote API (+ECB rates feed, Payment provider API,
// SMTP relay)" (MJL-0040).
export interface ListLimits {
  most: number;
  cap: number;
}

export const LISTED: ListLimits = { most: MAX_LISTED, cap: LABEL_CAP };
export const FAN_LISTED: ListLimits = {
  most: Number.POSITIVE_INFINITY,
  cap: 2 * LABEL_CAP,
};

// The text a group's label shows in place of its count, naming every member
// but the one it is named after: the other's label for a pair, the others in
// natural order joined by LIST_SEPARATOR for a larger group. Null when the
// group holds more members than the limits allow, or a label breaks the pair
// rules or, in a list, holds a comma.
export const listedOthers = (
  named: string,
  labels: readonly string[],
  limits = LISTED,
): string | null => {
  const at = labels.indexOf(named);
  const others = labels.filter((_, i) => i !== at);
  if (
    at < 0 ||
    labels.length < 2 ||
    labels.length > limits.most ||
    new Set(labels).size !== labels.length
  )
    return null;
  if (others.length > 1 && others.some((l) => l.includes(","))) return null;
  const text = [...others].sort(byNatural).join(LIST_SEPARATOR);
  const fits = (l: string): boolean => pairLabel(named, l, limits.cap) !== null;
  return others.every(fits) && fits(text) ? text : null;
};

// The labels a group may show, preferred first: the label cut, the whole
// label, then the label cut with the group's id, for when another node or
// group already shows the others. A pair label is shown only whole.
export const groupLabels = (
  {
    base,
    n,
    markdown,
    pair,
  }: {
    base: string;
    n: number;
    markdown?: true | undefined;
    pair?: string | undefined;
  },
  id: string,
): string[] => {
  if (pair !== undefined) return [`${base} (+${pair})`];
  const cut = `${shorten(base, markdown)} (+${n})`;
  return [...new Set([cut, `${base} (+${n})`, `${cut} [${id}]`])];
};

// The two labels a range label's base names, the first's then the last's.
export const rangeEnds = (base: string): string[] => {
  const parts = base.split(RANGE_SEPARATOR);
  return parts.length === 2 ? parts : [];
};

// The two labels a span label's base names, the entry's then the exit's.
export const spanEnds = (base: string): string[] => {
  const at = base.indexOf(LANE_SEPARATOR);
  return at < 0
    ? []
    : [base.slice(0, at), base.slice(at + LANE_SEPARATOR.length)];
};

// Mermaid source for an overview or a detail diagram, in the diagram's own
// type. Each label is written so mermaid's parser reads back the label it was
// read from: a markdown label in backticks, a double quote as #quot; where the
// grammar quotes it. A group node shows " (+N)" in its label, the subroutine
// shape in a flowchart, a thick dashed border in a stateDiagram or erDiagram
// and a <<group>> annotation in a classDiagram; a stub is drawn dashed, and
// in a classDiagram with a <<stub>> annotation, since that grammar takes no
// style. Nodes and edges are written in reading order: along the flow from
// the nodes nothing enters, breadth first, ties in natural order of ids.

// A label at the end of a line, as source text. Mermaid's sanitizer writes a
// "<" or ">" that opens no tag as &lt; or &gt;, and writes it so again when it
// reads the bare sign, so the bare sign goes back: a state or class line ends
// at the ";" of the entity otherwise.
const lineText = (label: string): string =>
  sourceEntities(label).replaceAll("&lt;", "<").replaceAll("&gt;", ">");

const oneLine = (s: string): string =>
  s.replaceAll("\r\n", "<br>").replaceAll("\n", "<br>");

// A label inside double quotes keeps an HTML entity as it is: the sanitizer
// reads &lt;tag&gt; back as itself, where a bare <tag> would open a tag and be
// dropped.
export const quoteLabel = (label: string): string =>
  oneLine(sourceEntities(label).replaceAll('"', "#quot;"));

// A label inside double quotes; a markdown label keeps its lines in backticks.
export const quoted = (label: string, markdown: true | undefined): string =>
  markdown ? `"\`${sourceEntities(label)}\`"` : `"${quoteLabel(label)}"`;

// A label at the end of a line, after a colon, where a quote is plain text.
export const tail = (label: string | undefined): string =>
  label ? ` : ${oneLine(lineText(label))}` : "";
