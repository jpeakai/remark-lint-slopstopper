import type { DocumentContext } from "../../document/context.ts";
import {
  GLYPH,
  INTERPUNCT,
  type InterpunctRun,
  interpunctRuns,
  isFlatList,
  isStacked,
} from "../../document/interpunct-runs.ts";
import { first, inRanges, last, type Range } from "../../document/ranges.ts";
import { matchesIn, type SourceText, textBlocks } from "../../document/source-text.ts";
import type { Diagnostic, TextEdit } from "../../types.ts";

// Which list policies are enabled to claim an Interpunct Run. A flat run is
// claimed only when it is long enough for the flat policy's threshold; a
// shorter run is no list, so its glyphs are stray interpuncts.
export interface RunOwners {
  flatMinItems: number | null;
  stacked: boolean;
}

// Only a separator reads as a comma: the spaces on both sides make the glyph
// a joiner rather than part of a name or a unit.
const SEPARATOR = /[ \t]+·[ \t]+/;

const claimed = (run: InterpunctRun, owners: RunOwners): boolean =>
  (owners.flatMinItems !== null && isFlatList(run, owners.flatMinItems)) || (owners.stacked && isStacked(run));

// Every glyph in the node must be a spaced separator, or one would be left
// behind, so a mixed node is reported without an edit.
const swapFor = (source: string, text: SourceText): TextEdit | undefined => {
  const glyphs = matchesIn(source, text, GLYPH);
  const separators = matchesIn(source, text, SEPARATOR);

  if (!separators?.length || glyphs?.length !== separators.length) {
    return;
  }

  const start = first(separators)[0];
  const end = last(separators)[1];
  let replacement = "";
  let at = start;

  for (const [from, to] of separators) {
    replacement += `${source.slice(at, from)}, `;
    at = to;
  }

  return { start, end, text: replacement };
};

const glyphRange = (text: SourceText, source: string): Range => {
  const slice = source.slice(text.start, text.end);
  const at = slice.indexOf(INTERPUNCT);

  if (at < 0) {
    return [text.start, text.end];
  }

  return [text.start + at, text.start + slice.lastIndexOf(INTERPUNCT) + 1];
};

const textFinding = (document: DocumentContext, text: SourceText): Diagnostic => {
  const [start, end] = glyphRange(text, document.source);
  const finding: Diagnostic = {
    ruleId: "prose/punctuation-interpunct-in-prose",
    start,
    end,
    message: "Interpunct in prose; use a comma, a slash or a list.",
  };
  const edit = swapFor(document.source, text);

  if (edit && document.safeEdit(edit, { kind: "same-shape" })) {
    finding.fix = edit;
  }

  return finding;
};

export const checkInterpunctInProse = (document: DocumentContext, owners: RunOwners): Promise<Diagnostic[]> => {
  const reported = interpunctRuns(document)
    .filter((run) => claimed(run, owners))
    .map((run) => run.range);

  return Promise.resolve(
    textBlocks(document.tree)
      .flat()
      .filter((text) => text.value.includes(INTERPUNCT) && !inRanges(text.start, reported))
      .map((text) => textFinding(document, text)),
  );
};
