import type { DocumentContext, ParagraphContext } from "../../document/context.ts";
import type { DeclaredEdit } from "../../document/edits.ts";
import { first, last, type Range, within } from "../../document/ranges.ts";
import {
  colonsBefore,
  colonsIn,
  matchesInAll,
  type SourceParagraph,
  sentenceSpans,
} from "../../document/source-text.ts";
import type { Diagnostic, RuleOptions } from "../../types.ts";
import { cleanLeadIn, itemsBetween, promote, sentenceRunCheck } from "../promotion.ts";

// A short series such as "parse, fix and verify" is ordinary English, so the
// default threshold is five items.
const DEFAULT_MIN_ITEMS = 5;

// One to three plain words, and nothing else.
const WORD = "[A-Za-z][A-Za-z'’-]*";
const ITEM = new RegExp(`^${WORD}(?:\\s+${WORD}){0,2}$`);
const JOINER = /\s+(?:and|or)\s+/;
const OXFORD = /^(?:and|or)\s+/;
const TERMINAL = /[.!?]+$/;

type Nlp = typeof import("compromise").default;

const PARTICIPLE = "(#Determiner|#Adjective|#Value) [(#PastTense|#Participle)] #Noun";

// A verb between an item's first and last words makes it a clause with a
// subject, as in "magenta are colours". A verb at either end still names a
// thing: "sign off", or "unit tests", which Compromise reads as a verb. A
// participle after a determiner describes the noun: "the signed tag".
const isClause = (nlp: Nlp, item: string): boolean => {
  const doc = nlp(item);

  doc.match(PARTICIPLE, 0).tag("Adjective");

  return doc
    .termList()
    .slice(1, -1)
    .some((term) => term.tags?.has("Verb"));
};

// CODE is how prose spells a code span, which the code-run policy owns.
const itemTest =
  (nlp: Nlp) =>
  (text: string): boolean => {
    const item = text.trim();

    return ITEM.test(item) && !/\bCODE\b/.test(item) && !isClause(nlp, item);
  };

// After a colon, the segment before the run carries the first item. Without
// one, where that item starts is a guess, so the segment is not counted: the
// count can fall one short, but never runs one over.
const announced = (segments: readonly string[], isItem: (text: string) => boolean): boolean => {
  if (!segments.length) {
    return false;
  }

  const head = last(segments);
  const at = head.lastIndexOf(":");

  return at >= 0 && isItem(head.slice(at + 1));
};

// The items of the run that closes a sentence, counted the way the edit
// cuts them, or 0 when the sentence does not close on one.
const plainRun = (sentence: string, isItem: (text: string) => boolean): number => {
  const segments = sentence.replace(TERMINAL, "").trim().split(/,\s+/);
  const closing = segments.pop() ?? "";

  // "d, and e" has an Oxford comma, so its last segment is one item; "d and
  // e" holds the last two.
  const oxford = OXFORD.test(closing);
  const tail = oxford ? [closing.replace(OXFORD, "")] : closing.split(JOINER);

  if (!tail.every(isItem)) {
    return 0;
  }

  let items = tail.length;

  // The sentence's own first segment is never counted here: a short
  // subject, as in "One finding, with a file, ...", reads like an item.
  while (segments.length > 1 && isItem(last(segments))) {
    segments.pop();
    items++;
  }

  const colon = announced(segments, isItem);

  if (colon) {
    items++;
  }

  return colon || oxford || tail.length > 1 ? items : 0;
};

// A final "and"/"or" with no comma before it is a cut of its own; after an
// Oxford comma the last item sheds it instead.
const finalJoiner = (source: string, after: number, end: number): Range[] => {
  const rest = source.slice(after, end);
  const joiner = /^\s+(?:and|or)\s+/.test(rest) ? null : JOINER.exec(rest);

  return joiner ? [[after + joiner.index, after + joiner.index + joiner[0].length]] : [];
};

// The edit needs a colon lead-in, because without one there is no telling
// where the first item starts.
const promotion = (
  source: string,
  paragraph: SourceParagraph,
  minItems: number,
  isItem: (text: string) => boolean,
): DeclaredEdit | null => {
  const commas = matchesInAll(source, paragraph.texts, /,(?=\s)/);
  const colons = colonsIn(source, paragraph);

  if (commas === null || colons === null) {
    return null;
  }

  for (const span of sentenceSpans(source, paragraph)) {
    const inside = commas.filter((comma) => within(comma, span));
    const colon = inside.length ? colonsBefore(colons, span, first(inside)[0]).pop() : undefined;

    if (!colon) {
      continue;
    }

    const items = itemsBetween(source, [colon, ...inside, ...finalJoiner(source, last(inside)[1], span[1])], span[1]);

    if (items.length < minItems || !items.every(isItem)) {
      continue;
    }

    return promote({
      source,
      paragraph,
      span,
      leadIn: cleanLeadIn(source.slice(span[0], colon[0])),
      items: items.map((text) => ({ text })),
      ordered: false,
    });
  }

  return null;
};

// Compromise loads with the first check, as the shared language view does.
export const checkCommaPlainRun = async (
  document: DocumentContext,
  paragraph: ParagraphContext,
  options: RuleOptions,
): Promise<Diagnostic[]> => {
  const isItem = itemTest((await import("compromise")).default);

  return sentenceRunCheck({
    ruleId: "prose/list-comma-plain-run",
    defaultMinItems: DEFAULT_MIN_ITEMS,
    items: (sentence) => plainRun(sentence, isItem),
    message: (items) => `Comma-joined run of ${items} plain items; promote the items to a bullet list.`,
    promotion: (source, run, minItems) => promotion(source, run, minItems, isItem),
  })(document, paragraph, options);
};
