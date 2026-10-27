import type { DeclaredEdit } from "../../document/edits.ts";
import { collapse, first, type Range, spansBetween, within } from "../../document/ranges.ts";
import { colonsIn, matchesInAll, type SourceParagraph, sentenceSpans } from "../../document/source-text.ts";
import { cleanLeadIn, itemsOf, promote, sentenceRunCheck } from "../promotion.ts";

// A labelled segment: an optional joining conjunction, an optional "Rules: "
// intro on the first segment, the label (inline code or an identifier such
// as MD025 or S4), and content after it that makes it an item rather than a
// bare mention.
const JOINER = "(?:and\\s+|or\\s+)?";
const INTRO = "(?:[A-Za-z][\\w\\s-]{0,24}:\\s*)?";
const LABEL = "(?:CODE|[A-Z][A-Za-z]*\\d[\\w/-]*)";
const CONTENT = "\\s+\\S";
const LABELLED_SEGMENT = new RegExp(`^${JOINER}${INTRO}${LABEL}${CONTENT}`);
const INTRO_ONLY = /^[A-Za-z][\w\s-]{0,24}$/;
const DEFAULT_MIN_ITEMS = 3;

const labelledSegments = (sentence: string): number =>
  sentence.split(/,\s+/).filter((segment) => LABELLED_SEGMENT.test(segment)).length;

// A source slice as the check reads it: inline code becomes one CODE token.
const asProse = (source: string, paragraph: SourceParagraph, range: Range): string => {
  let out = "";
  let at = range[0];

  for (const [start, end] of paragraph.codes) {
    if (end <= range[0] || start >= range[1]) {
      continue;
    }

    out += `${source.slice(at, start)}CODE`;
    at = end;
  }

  return collapse(out + source.slice(at, range[1])).trim();
};

// The comma-separated segments of a sentence when every one is labelled.
const labelledRun = (source: string, paragraph: SourceParagraph, commas: Range[], span: Range): Range[] | null => {
  const inside = commas.filter((comma) => within(comma, span));

  if (inside.length === 0) {
    return null;
  }

  const segments = spansBetween([[span[0], span[0]], ...inside], span[1]);

  return segments.every((segment) => LABELLED_SEGMENT.test(asProse(source, paragraph, segment))) ? segments : null;
};

// An intro colon in the first segment is the lead-in, and the first item
// starts after it, so the intro is not repeated in the first bullet.
interface LabelledSentence {
  source: string;
  paragraph: SourceParagraph;
  span: Range;
  segments: Range[];
  colons: Range[];
}

const promoteRun = ({ source, paragraph, span, segments, colons }: LabelledSentence): DeclaredEdit | null => {
  const opening = first(segments);
  const colon = colons.find((c) => within(c, opening));
  const intro = colon !== undefined && INTRO_ONLY.test(collapse(source.slice(span[0], colon[0])).trim());
  const items: Range[] = intro && colon ? [[colon[1], opening[1]], ...segments.slice(1)] : segments;

  return promote({
    source,
    paragraph,
    span,
    leadIn: intro && colon ? cleanLeadIn(source.slice(span[0], colon[0])) : null,
    items: itemsOf(source, items).map((text) => ({ text })),
    ordered: false,
  });
};

// Only the first fully labelled sentence is promoted in one round.
const promotion = (source: string, paragraph: SourceParagraph, minItems: number): DeclaredEdit | null => {
  const commas = matchesInAll(source, paragraph.texts, /,(?=\s)/);
  const colons = colonsIn(source, paragraph);

  if (commas === null || colons === null) {
    return null;
  }

  for (const span of sentenceSpans(source, paragraph)) {
    const segments = labelledRun(source, paragraph, commas, span);

    if (segments !== null && segments.length >= minItems) {
      return promoteRun({ source, paragraph, span, segments, colons });
    }
  }

  return null;
};

export const checkCommaLabelledRun = sentenceRunCheck({
  ruleId: "prose/list-comma-labelled-run",
  defaultMinItems: DEFAULT_MIN_ITEMS,
  items: labelledSegments,
  message: (items) => `Comma-joined run of ${items} labelled items; promote the items to a bullet list.`,
  promotion,
});
