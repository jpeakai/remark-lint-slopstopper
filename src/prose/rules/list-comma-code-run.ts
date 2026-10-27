import type { DeclaredEdit } from "../../document/edits.ts";
import { collapse, last, type Range, within } from "../../document/ranges.ts";
import { type SourceParagraph, sentenceSpans } from "../../document/source-text.ts";
import { cleanLeadIn, promote, sentenceRunCheck } from "../promotion.ts";

// The run as the check reads prose, where each code span is one CODE token.
// Plain words stay with the plain-run policy, because a series such as
// "parse, fix and verify" is ordinary English.
const RUN = /CODE(?:\s*,\s+CODE)*(?:\s*,?\s+(?:and|or)\s+CODE)?/g;
const DEFAULT_MIN_ITEMS = 3;

const longestRun = (sentence: string): number =>
  Math.max(0, ...[...sentence.matchAll(RUN)].map((match) => match[0].split("CODE").length - 1));

// Between two items only a comma may sit, or before the last item a
// conjunction with an optional comma. A link or emphasis marker ends the run.
const COMMA = /^\s*,\s+$/;
const JOINER = /^\s*,?\s+(?:and|or)\s+$/;

// After the last item only the sentence's terminal may follow.
const TAIL = /^\s*[.!?]?\s*$/;

// The code spans that close the sentence as a run, in order.
const tailRun = (source: string, codes: Range[], span: Range, minItems: number): Range[] | null => {
  const inside = codes.filter((code) => within(code, span));

  if (inside.length < minItems) {
    return null;
  }

  if (!TAIL.test(source.slice(last(inside)[1], span[1]))) {
    return null;
  }

  const run = [last(inside)];

  for (const code of inside.slice(0, -1).reverse()) {
    const gap = source.slice(code[1], (run[0] as Range)[0]);

    if (!(COMMA.test(gap) || (run.length === 1 && JOINER.test(gap)))) {
      break;
    }

    run.unshift(code);
  }

  return run.length >= minItems ? run : null;
};

// A colon already closing the lead-in inside emphasis, as in "**Paths:**",
// is kept as written rather than given a second colon.
const EMPHASISED_COLON = /:[*_]+$/;

// The lead-in must end in whitespace, so an item that opens inside a link,
// emphasis or a bracket is never cut away from its opening mark.
const leadInOf = (head: string): string | null => {
  if (!/\s$/.test(head)) {
    return null;
  }

  const trimmed = collapse(head).trim();

  return EMPHASISED_COLON.test(trimmed) ? trimmed : cleanLeadIn(head);
};

// The edit needs the run to close its sentence after a lead-in, so no text
// is left trailing the list it becomes.
const promotion = (source: string, paragraph: SourceParagraph, minItems: number): DeclaredEdit | null => {
  for (const span of sentenceSpans(source, paragraph)) {
    const run = tailRun(source, paragraph.codes, span, minItems);

    if (run === null) {
      continue;
    }

    const leadIn = leadInOf(source.slice(span[0], (run[0] as Range)[0]));

    if (leadIn === null) {
      continue;
    }

    return promote({
      source,
      paragraph,
      span,
      leadIn,
      items: run.map(([start, end]) => ({ text: source.slice(start, end) })),
      ordered: false,
    });
  }

  return null;
};

export const checkCommaCodeRun = sentenceRunCheck({
  ruleId: "prose/list-comma-code-run",
  defaultMinItems: DEFAULT_MIN_ITEMS,
  items: longestRun,
  message: (items) => `Comma-joined run of ${items} code spans; promote the spans to a bullet list.`,
  promotion,
});
