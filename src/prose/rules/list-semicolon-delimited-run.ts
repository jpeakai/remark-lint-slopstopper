import type { DeclaredEdit } from "../../document/edits.ts";
import { countOf, first, within } from "../../document/ranges.ts";
import {
  colonsBefore,
  colonsIn,
  matchesInAll,
  type SourceParagraph,
  sentenceSpans,
} from "../../document/source-text.ts";
import {
  cleanLeadIn,
  itemsBetween,
  promote,
  sentenceRunCheck,
} from "../promotion.ts";

const SEMICOLON = /;/g;
// Two semicolons join three items.
const DEFAULT_MIN_ITEMS = 3;

// The first sentence with enough semicolons and a colon lead-in is the only
// one promoted; the next round comes back for the rest.
const promotion = (
  source: string,
  paragraph: SourceParagraph,
  minItems: number,
): DeclaredEdit | null => {
  const semicolons = matchesInAll(source, paragraph.texts, SEMICOLON);
  const colons = colonsIn(source, paragraph);
  if (semicolons === null || colons === null) return null;
  for (const span of sentenceSpans(source, paragraph)) {
    const inside = semicolons.filter((semicolon) => within(semicolon, span));
    if (inside.length === 0 || inside.length + 1 < minItems) continue;
    // The outermost colon opens the lead-in, so "Note: the rules: a; b; c"
    // keeps the whole of "Note: the rules".
    const colon = colonsBefore(colons, span, first(inside)[0])[0];
    if (!colon) continue;
    return promote({
      source,
      paragraph,
      span,
      leadIn: cleanLeadIn(source.slice(span[0], colon[0])),
      items: itemsBetween(source, [colon, ...inside], span[1]).map((text) => ({
        text,
      })),
      ordered: false,
    });
  }
  return null;
};

export const checkSemicolonDelimitedRun = sentenceRunCheck({
  ruleId: "prose/list-semicolon-delimited-run",
  defaultMinItems: DEFAULT_MIN_ITEMS,
  items: (sentence) => countOf(sentence, SEMICOLON) + 1,
  message: (items) =>
    `Semicolon-delimited list (${items - 1} semicolons) in one sentence; promote the items to a bullet list.`,
  promotion,
});
