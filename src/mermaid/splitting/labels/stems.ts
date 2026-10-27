import { Parser } from "htmlparser2";
import { stemmer } from "stemmer";
import { DOTTED, htmlEntities, ID_LEAD } from "./text.ts";

// Label similarity for suggested grouping: Porter's stemmer and a Jaccard
// score over the stems of two labels, where a role word (service, queue, db
// and the like) weighs a quarter, so "Order service" and
// "Orders DB" are close and "Order service" and "Payment service" are not.
// An id-like label says nothing about meaning, so it contributes nothing.

// Stop words, and the "fa" of a Font Awesome icon a label names (fa:fa-car).
const STOP = new Set(["fa", "the", "a", "an", "of", "to", "and", "or", "for", "in", "on", "by", "with", "is", "per"]);
const ROLE_WORDS = [
  "service",
  "db",
  "database",
  "queue",
  "feed",
  "log",
  "gateway",
  "processor",
  "api",
  "store",
  "cache",
  "bucket",
  "table",
];

const ROLE_WEIGHT = 0.25;

// Porter's stemmer, as the stemmer package keeps it.
export const stem = (word: string): string => stemmer(word.toLowerCase());

const ID_LIKE = /^[A-Za-z]{0,2}\d*$/;

// Parse label markup without creating a browser or sharing mutable DOM state.
const words = new Intl.Segmenter("en", { granularity: "word" });

const textOf = (label: string, lineBreaks = false): string => {
  const text: string[] = [];

  new Parser({
    ontext: (part) => {
      text.push(part);
    },
    onopentagname: (name) => {
      if (lineBreaks && name === "br") {
        text.push(" ");
      }
    },
  }).end(htmlEntities(label));

  return text.join("");
};

const wordsOf = (label: string): string[] =>
  [...words.segment(textOf(label))].filter((s) => s.isWordLike).map((s) => s.segment.toLowerCase());

// Preserve line boundaries as spaces so adjacent label lines never join words.
export const plainText = (label: string): string => {
  return textOf(label, true).split(/\s+/).filter(Boolean).join(" ");
};

// The stems of a label's words, or none for an id-like label.
export const labelBag = (label: string, id: string): Set<string> => {
  const text = label.trim();

  if (text === id || ID_LIKE.test(text)) {
    return new Set();
  }

  return new Set(
    wordsOf(text)
      .filter((w) => !STOP.has(w))
      .map(stem),
  );
};

// Role words compared by their stems, as the labels are.
const ROLE = new Set(ROLE_WORDS.map(stem));

const weight = (w: string): number => (ROLE.has(w) ? ROLE_WEIGHT : 1);

export const similarity = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  let shared = 0;
  let union = 0;

  for (const w of new Set([...a, ...b])) {
    union += weight(w);

    if (a.has(w) && b.has(w)) {
      shared += weight(w);
    }
  }

  return union === 0 ? 0 : shared / union;
};

// The prefix family a node names: a dotted namespace leading its label, as
// bronze.orders; else the letters leading a label that leads with an id, as
// PLAT-1201 or OPS_12; else the letters before an underscore leading its id,
// as br_orders. Null for a node that names none, as "10002 Backlog".
const FAMILY_ID_LEAD = /^([A-Za-z]{1,5})[-_]?\d{2,}(?=$|[\s:._-])/;
const STAGE_ID = /^([A-Za-z]+)_[A-Za-z0-9]/;

export const stageOf = (label: string, id: string): string | null => {
  const text = label.trim();
  const found = DOTTED.exec(text)?.[1] ?? FAMILY_ID_LEAD.exec(text)?.[1] ?? STAGE_ID.exec(id)?.[1] ?? null;

  return found?.toLowerCase() ?? null;
};

// The status family of each node whose label leads with an id and names no
// prefix family, as "10008 Ready for Release": the stem of a word after the
// id that the label shares with another such label, as "releas" in "10009
// Released". The words after the id are a status, and two statuses sharing a
// stem name one stage of a workflow. A label sharing no stem, or sharing two,
// names none. Each family is marked apart from prefix families.
export const STATUS_MARK = "~";

const countStems = (stems: Map<string, Set<string>>): Map<string, number> => {
  const count = new Map<string, number>();

  for (const words of stems.values()) {
    for (const word of words) {
      count.set(word, (count.get(word) ?? 0) + 1);
    }
  }

  return count;
};

export const statusFamilies = (labels: ReadonlyMap<string, string>): Map<string, string> => {
  const stems = new Map<string, Set<string>>();

  for (const [id, label] of labels) {
    const text = label.trim();
    const lead = ID_LEAD.exec(text);

    if (!lead || stageOf(text, id) !== null) {
      continue;
    }

    const words = labelBag(text.slice(lead[0].length), id);

    stems.set(id, new Set([...words].filter((w) => !ID_LIKE.test(w))));
  }

  const count = countStems(stems);
  const out = new Map<string, string>();

  for (const [id, ws] of stems) {
    const shared = [...ws].filter((w) => (count.get(w) ?? 0) > 1);

    if (shared.length === 1) {
      out.set(id, `${STATUS_MARK}${shared[0]}`);
    }
  }

  return out;
};

const named = (xs: Iterable<string | null>): Set<string> => new Set([...xs].filter((s): s is string => s !== null));

// Whether two sets of members name families and share none: merging them
// would mix two stages of a pipeline, such as an extract and a gold table.
export const crossesStages = (a: Iterable<string | null>, b: Iterable<string | null>): boolean => {
  const [sa, sb] = [named(a), named(b)];

  return sa.size > 0 && sb.size > 0 && ![...sa].some((s) => sb.has(s));
};

// Whether members name two prefix families or more between them.
export const mixesFamilies = (families: Iterable<string | null>): boolean => named(families).size > 1;

// Whether two sets of members name one prefix family between them, and only one.
export const oneFamily = (a: Iterable<string | null>, b: Iterable<string | null>): boolean =>
  named([...a, ...b]).size === 1 && named(a).size === 1 && named(b).size === 1;
