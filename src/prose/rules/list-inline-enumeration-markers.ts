import {
  type DocumentContext,
  endOf,
  type ParagraphContext,
  startOf,
} from "../../document/context.ts";
import type { DeclaredEdit } from "../../document/edits.ts";
import { first, last, type Range } from "../../document/ranges.ts";
import {
  type SourceParagraph,
  type SourceText,
  sentenceSpan,
  sourceParagraph,
} from "../../document/source-text.ts";
import type { Diagnostic } from "../../types.ts";
import {
  cleanLeadIn,
  itemsBetween,
  promote,
  runFinding,
  withPromotion,
} from "../promotion.ts";

// Requiring the first two markers of a family keeps a lone "(a)" reference
// or a citation from reading as a list.
const FAMILIES: [string, string][] = [
  ["(a)", "(b)"],
  ["(1)", "(2)"],
  ["(i)", "(ii)"],
];
const ROMAN = [
  "i",
  "ii",
  "iii",
  "iv",
  "v",
  "vi",
  "vii",
  "viii",
  "ix",
  "x",
  "xi",
  "xii",
];
const SEQUENCES = new Map<string, string[]>([
  ["a", [..."abcdefghijklmnopqrstuvwxyz"]],
  ["1", Array.from({ length: 99 }, (_, i) => String(i + 1))],
  ["i", ROMAN],
]);
const MARKER = /\(([a-z]|[ivx]+|\d{1,2})\)(?=\s)/g;

interface Marker {
  range: Range;
  label: string;
}

// Markers that open an item: at the start of a text node or after
// whitespace, and before whitespace.
const opening = (text: string): RegExpExecArray[] =>
  [...text.matchAll(MARKER)].filter(
    (match) => match.index === 0 || /\s/.test(text.charAt(match.index - 1)),
  );

// The parsed value must agree with the source, or an escape is hiding a
// marker and no edit is offered.
const markersIn = (
  source: string,
  texts: readonly SourceText[],
): Marker[] | null => {
  const markers: Marker[] = [];
  for (const text of texts) {
    const found = opening(source.slice(text.start, text.end));
    if (found.length !== opening(text.value).length) return null;
    for (const match of found) {
      const start = text.start + match.index;
      markers.push({
        range: [start, start + match[0].length],
        label: match[1] ?? "",
      });
    }
  }
  return markers;
};

// Every marker in order from the family the first opens, none skipped.
const cleanSequence = (
  source: string,
  paragraph: SourceParagraph,
): Marker[] | null => {
  const markers = markersIn(source, paragraph.texts);
  if (markers === null || markers.length < 2) return null;
  const sequence = SEQUENCES.get(first(markers).label);
  if (!sequence || markers.some((marker, i) => marker.label !== sequence[i]))
    return null;
  return markers;
};

// Markers split across sentences are two references, not one list.
const splitAcrossSentences = (
  source: string,
  paragraph: SourceParagraph,
  markers: Marker[],
): boolean =>
  paragraph.texts.some((text) =>
    /[.!?]\s/.test(
      source.slice(
        Math.max(text.start, first(markers).range[1]),
        Math.min(text.end, last(markers).range[0]),
      ),
    ),
  );

// Two markers joined only by a conjunction, with no colon to announce them,
// read as cross-references: "see (a) above and (b) below".
const crossReference = (
  source: string,
  span: Range,
  markers: Marker[],
): boolean => {
  if (markers.length !== 2) return false;
  const opener = first(markers);
  const closer = last(markers);
  const announced = /:\s*$/.test(source.slice(span[0], opener.range[0]));
  const separated = /[,;]\s*$/.test(
    source.slice(opener.range[1], closer.range[0]),
  );
  return !(announced || separated);
};

const promotion = (
  source: string,
  paragraph: SourceParagraph,
): DeclaredEdit | null => {
  const markers = cleanSequence(source, paragraph);
  if (markers === null || splitAcrossSentences(source, paragraph, markers))
    return null;
  const opener = first(markers);
  const span = sentenceSpan(
    source,
    paragraph,
    opener.range[0],
    last(markers).range[1],
  );
  if (crossReference(source, span, markers)) return null;
  return promote({
    source,
    paragraph,
    span,
    leadIn: cleanLeadIn(source.slice(span[0], opener.range[0])),
    items: itemsBetween(
      source,
      markers.map((marker) => marker.range),
      span[1],
    ).map((text) => ({ text })),
    ordered: true,
  });
};

export const checkInlineEnumerationMarkers = (
  document: DocumentContext,
  paragraph: ParagraphContext,
): Promise<Diagnostic[]> => {
  const prose = document.projection(paragraph.node).text;
  const family = FAMILIES.find(
    ([opener, second]) => prose.includes(opener) && prose.includes(second),
  );
  if (!family) return Promise.resolve([]);
  const { source } = document;
  const finding = runFinding(
    "prose/list-inline-enumeration-markers",
    [startOf(paragraph.node), endOf(paragraph.node)],
    `Enumeration ${family.join(" ")} ... inlined in prose; promote the items to a numbered list.`,
  );
  return Promise.resolve(
    withPromotion(
      document,
      [finding],
      promotion(source, sourceParagraph(source, paragraph)),
    ),
  );
};
