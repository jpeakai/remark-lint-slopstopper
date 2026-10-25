import type { Nodes, Root, Text } from "mdast";
import {
  type DocumentContext,
  endOf,
  type ParagraphContext,
  startOf,
} from "./context.ts";
import { type Range, within } from "./ranges.ts";

// A text node with its parsed value and its source offsets. Only a text node
// carries separators an edit may cut on: text inside code is cargo.
export interface SourceText {
  value: string;
  start: number;
  end: number;
}

// One paragraph as source: its bytes, its indentation, the text nodes that
// are its direct children and the inline code anywhere inside it.
export interface SourceParagraph {
  context: ParagraphContext;
  start: number;
  end: number;
  raw: string;
  indent: string;
  texts: SourceText[];
  codes: Range[];
}

const sourceTextOf = (node: Text): SourceText => ({
  value: node.value,
  start: startOf(node),
  end: endOf(node),
});

const inlineCodes = (node: Nodes): Range[] => {
  if (node.type === "inlineCode") return [[startOf(node), endOf(node)]];
  return "children" in node ? node.children.flatMap(inlineCodes) : [];
};

export const sourceParagraph = (
  source: string,
  context: ParagraphContext,
): SourceParagraph => {
  const { node } = context;
  const start = startOf(node);
  const end = endOf(node);
  return {
    context,
    start,
    end,
    raw: source.slice(start, end),
    indent: " ".repeat((node.position?.start.column ?? 1) - 1),
    texts: node.children.flatMap((child) =>
      child.type === "text" && child.position ? [sourceTextOf(child)] : [],
    ),
    codes: inlineCodes(node),
  };
};

const BLOCKS = new Set(["paragraph", "heading", "tableCell"]);

// Every positioned text node, grouped by the paragraph, heading or table cell
// that holds it, in document order.
export const textBlocks = (tree: Root): SourceText[][] => {
  const blocks = new Map<Nodes, SourceText[]>();
  const add = (owner: Nodes, node: Text): void => {
    blocks.set(owner, [...(blocks.get(owner) ?? []), sourceTextOf(node)]);
  };
  const walk = (node: Nodes, block: Nodes | undefined): void => {
    const owner = BLOCKS.has(node.type) ? node : block;
    if (node.type === "text" && owner && node.position) add(owner, node);
    if ("children" in node)
      for (const child of node.children) walk(child, owner);
  };
  walk(tree, undefined);
  return [...blocks.values()];
};

// Absolute ranges of every match inside a text node, or null when the source
// slice and the parsed value disagree, as with an entity or an escape. A
// glyph that cannot be mapped back to the source is never rewritten.
export const matchesIn = (
  source: string,
  text: SourceText,
  pattern: RegExp,
): Range[] | null => {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  const inSource = [...source.slice(text.start, text.end).matchAll(global)];
  if (inSource.length !== [...text.value.matchAll(global)].length) return null;
  return inSource.map((match) => [
    text.start + match.index,
    text.start + match.index + match[0].length,
  ]);
};

export const matchesInAll = (
  source: string,
  texts: readonly SourceText[],
  pattern: RegExp,
): Range[] | null => {
  const found: Range[] = [];
  for (const text of texts) {
    const ranges = matchesIn(source, text, pattern);
    if (ranges === null) return null;
    found.push(...ranges);
  }
  return found;
};

// Every separator of a paragraph an edit may cut on, or null when one cannot
// be trusted: an entity, an escape, or a separator inside a link or emphasis
// rather than direct text. Cutting on a subset would drop an item.
export const splittableSeparators = (
  source: string,
  paragraph: SourceParagraph,
  separator: RegExp,
  expected: number,
): Range[] | null => {
  const found = matchesInAll(source, paragraph.texts, separator);
  if (found === null || found.length !== expected) return null;
  return found.some(([start]) => source[start - 1] === "\\") ? null : found;
};

// Sentence boundaries an edit trusts: a terminal followed by whitespace in a
// direct text node, as [end of terminal, start of next sentence].
const boundaries = (source: string, paragraph: SourceParagraph): Range[] =>
  paragraph.texts
    .flatMap((text) =>
      [...source.slice(text.start, text.end).matchAll(/[.!?]+(\s+)/g)].map(
        (match): Range => {
          const end = text.start + match.index + match[0].length;
          return [end - (match[1]?.length ?? 0), end];
        },
      ),
    )
    .sort((a, b) => a[0] - b[0]);

// The span from the start of the sentence holding `from` to the end of the
// sentence holding `to`.
export const sentenceSpan = (
  source: string,
  paragraph: SourceParagraph,
  from: number,
  to: number,
): Range => {
  let start = paragraph.start;
  let end = paragraph.end;
  for (const [terminalEnd, nextStart] of boundaries(source, paragraph)) {
    if (nextStart <= from) start = nextStart;
    if (terminalEnd >= to && end === paragraph.end) end = terminalEnd;
  }
  return [start, end];
};

export const sentenceSpans = (
  source: string,
  paragraph: SourceParagraph,
): Range[] => {
  const spans: Range[] = [];
  let start = paragraph.start;
  for (const [terminalEnd, nextStart] of boundaries(source, paragraph)) {
    spans.push([start, terminalEnd]);
    start = nextStart;
  }
  spans.push([start, paragraph.end]);
  return spans;
};

// The colons of a paragraph's direct text, or null when one cannot be mapped.
export const colonsIn = (
  source: string,
  paragraph: SourceParagraph,
): Range[] | null => matchesInAll(source, paragraph.texts, /:/);

// The colons that could announce a list: inside `range` and closing before
// the first item starts.
export const colonsBefore = (
  colons: readonly Range[],
  range: Range,
  item: number,
): Range[] =>
  colons.filter((colon) => within(colon, range) && colon[1] <= item);

// One sentence of the shared language model with its source range.
export interface ProseSentence {
  text: string;
  range: Range;
}

export const proseSentences = async (
  document: DocumentContext,
  { node }: ParagraphContext,
): Promise<ProseSentence[]> => {
  const view = document.projection(node);
  const end = endOf(node);
  return (await document.language(node).sentences).map((sentence) => ({
    text: sentence.text,
    range: [
      view.offsets[sentence.start] ?? startOf(node),
      Math.min(end, view.endOffsets[sentence.end - 1] ?? end),
    ],
  }));
};
