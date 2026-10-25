import type { DocumentContext } from "../../document/context.ts";
import { first, last, type Range } from "../../document/ranges.ts";
import {
  matchesIn,
  type SourceText,
  textBlocks,
} from "../../document/source-text.ts";
import type { Diagnostic, TextEdit } from "../../types.ts";

const RULE_ID = "prose/punctuation-em-dash-in-prose";
const MESSAGE =
  "Em-dash in prose; use a comma, colon, parentheses or two sentences.";
// Any horizontal space around the dash belongs to it, including no-break and
// zero-width spaces, or a swap would strand one in front of the colon.
const DASH = /[\p{Zs}\t​]*—[\p{Zs}\t​]*/u;
// An aside that reads as an enumeration marker in disguise.
const MARKER_LIKE = /^(?:[a-z]|[ivx]+|\d+)$/i;

interface Dash {
  range: Range;
  text: SourceText;
}

// The dashes of one sentence of one block. A pair only reads as an aside
// when both halves sit in the same sentence.
interface Aside {
  dashes: Dash[];
  hasColon: boolean;
}

// Absolute offsets of every match across a block's text, so a terminal or a
// colon inside code never splits a sentence.
const offsetsIn = (
  source: string,
  texts: readonly SourceText[],
  pattern: RegExp,
): number[] =>
  texts.flatMap((text) =>
    [...source.slice(text.start, text.end).matchAll(pattern)].map(
      (match) => text.start + match.index,
    ),
  );

const asidesIn = (
  source: string,
  texts: readonly SourceText[],
  dashes: readonly Dash[],
): Aside[] => {
  const terminals = offsetsIn(source, texts, /[.!?](?=\s)/g);
  const colons = offsetsIn(source, texts, /:/g);
  const sentenceOf = (offset: number): number =>
    terminals.filter((terminal) => terminal < offset).length;
  const bySentence = new Map<number, Dash[]>();
  for (const dash of dashes) {
    const sentence = sentenceOf(dash.range[0]);
    bySentence.set(sentence, [...(bySentence.get(sentence) ?? []), dash]);
  }
  return [...bySentence].map(([sentence, group]) => ({
    dashes: group,
    hasColon: colons.some((colon) => sentenceOf(colon) === sentence),
  }));
};

// A dash touching a line break, the edge of its text node, or punctuation
// that already ends or opens a clause has no clear neighbours to join.
const touchesEdge = (source: string, { range, text }: Dash): boolean =>
  range[0] === text.start ||
  range[1] === text.end ||
  /[\r\n.!?:;,(\\]/.test(source[range[0] - 1] ?? "\n") ||
  /[\r\n.!?:;,)]/.test(source[range[1]] ?? "\n");

// A pair wraps an aside, so it becomes parentheses, unless the aside would
// read as an enumeration marker. A lone dash joins two clauses, so it becomes
// a colon, unless it is a numeric range or the sentence already has a colon.
// Three or more dashes is a shape no edit claims to understand.
const replacementFor = (
  source: string,
  { dashes, hasColon }: Aside,
): string | null => {
  const opening = first(dashes);
  if (dashes.length === 2) {
    const inner = source.slice(opening.range[1], last(dashes).range[0]);
    return MARKER_LIKE.test(inner.trim()) ? null : ` (${inner}) `;
  }
  if (dashes.length !== 1) return null;
  const numericRange =
    /\d/.test(source[opening.range[0] - 1] ?? "") &&
    /\d/.test(source[opening.range[1]] ?? "");
  return numericRange || hasColon ? null : ": ";
};

const rewrite = (source: string, aside: Aside): TextEdit | null => {
  if (aside.dashes.some((dash) => touchesEdge(source, dash))) return null;
  const text = replacementFor(source, aside);
  if (text === null) return null;
  return {
    start: first(aside.dashes).range[0],
    end: last(aside.dashes).range[1],
    text,
  };
};

const asideFinding = (document: DocumentContext, aside: Aside): Diagnostic => {
  const edit = rewrite(document.source, aside);
  const finding: Diagnostic = {
    ruleId: RULE_ID,
    start: first(aside.dashes).range[0],
    end: last(aside.dashes).range[1],
    message: MESSAGE,
  };
  if (edit && document.safeEdit(edit, { kind: "same-shape" }))
    finding.fix = edit;
  return finding;
};

// A block whose source and parsed value disagree is reported without an
// edit, so a swap never lands beside a glyph that cannot be seen.
const blockFindings = (
  document: DocumentContext,
  texts: readonly SourceText[],
): Diagnostic[] => {
  const found = texts.map((text) => matchesIn(document.source, text, DASH));
  if (found.some((ranges) => ranges === null))
    return texts
      .filter((text) => text.value.includes("—"))
      .map((text) => ({
        ruleId: RULE_ID,
        start: text.start,
        end: text.end,
        message: MESSAGE,
      }));
  const dashes = texts.flatMap((text, i) =>
    (found[i] ?? []).map((range) => ({ range, text })),
  );
  return asidesIn(document.source, texts, dashes).map((aside) =>
    asideFinding(document, aside),
  );
};

export const checkEmDashInProse = (
  document: DocumentContext,
): Promise<Diagnostic[]> =>
  Promise.resolve(
    textBlocks(document.tree).flatMap((texts) =>
      blockFindings(document, texts),
    ),
  );
