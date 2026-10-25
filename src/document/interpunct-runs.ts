import {
  type DocumentContext,
  endOf,
  type ParagraphContext,
  runningProse,
  startOf,
} from "./context.ts";
import { countOf, type Range } from "./ranges.ts";

export const INTERPUNCT = "·";
export const GLYPH = /·/g;
// The glyph with the space a run puts around it, which a promotion cuts on.
export const RUN_SEPARATOR = /[ \t]*·[ \t]*/;

// A running paragraph whose prose joins items with interpuncts. One separator
// is enough to be an Interpunct Run; how many items make a list is decided by
// the policy that owns it.
export interface InterpunctRun {
  paragraph: ParagraphContext;
  range: Range;
  separators: number;
  // Source lines of the paragraph that carry a separator.
  lines: number;
}

export const interpunctRun = (
  document: DocumentContext,
  paragraph: ParagraphContext,
): InterpunctRun[] => {
  const separators = countOf(document.projection(paragraph.node).text, GLYPH);
  if (separators < 1) return [];
  const range: Range = [startOf(paragraph.node), endOf(paragraph.node)];
  const lines = document.source
    .slice(...range)
    .split("\n")
    .filter((line) => line.includes(INTERPUNCT)).length;
  return [{ paragraph, range, separators, lines }];
};

export const interpunctRuns = (document: DocumentContext): InterpunctRun[] =>
  document.paragraphs
    .filter(runningProse)
    .flatMap((paragraph) => interpunctRun(document, paragraph));

export const DEFAULT_MIN_INTERPUNCT_ITEMS = 3;

// A run on one source line is a flat list; a run over two or more lines is a
// stacked, two-level structure. The two predicates never both hold.
export const isFlatList = (run: InterpunctRun, minItems: number): boolean =>
  run.lines === 1 && run.separators + 1 >= minItems;

export const isStacked = (run: InterpunctRun): boolean =>
  run.lines >= 2 && run.separators >= 2;
