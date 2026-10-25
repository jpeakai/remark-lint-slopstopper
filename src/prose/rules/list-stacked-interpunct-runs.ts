import type { DocumentContext } from "../../document/context.ts";
import type { DeclaredEdit } from "../../document/edits.ts";
import {
  type InterpunctRun,
  interpunctRuns,
  isStacked,
  RUN_SEPARATOR,
} from "../../document/interpunct-runs.ts";
import { collapse, first, type Range, within } from "../../document/ranges.ts";
import {
  colonsBefore,
  colonsIn,
  type SourceParagraph,
  sourceParagraph,
  splittableSeparators,
} from "../../document/source-text.ts";
import type { Diagnostic } from "../../types.ts";
import {
  itemsBetween,
  type PromotedItem,
  promote,
  runFinding,
  withPromotion,
} from "../promotion.ts";

const linesOf = ({ start, raw }: SourceParagraph): Range[] => {
  let at = start;
  return raw.split("\n").map((line): Range => {
    const range: Range = [at, at + line.length];
    at += line.length + 1;
    return range;
  });
};

// One line read as `Label: a · b · c`, or null for any other shape.
const parentOf = (
  source: string,
  line: Range,
  separators: Range[],
  colons: Range[],
): PromotedItem | null => {
  const inside = separators.filter((separator) => within(separator, line));
  if (inside.length === 0) return null;
  const colon = colonsBefore(colons, line, first(inside)[0])[0];
  if (!colon) return null;
  return {
    text: collapse(source.slice(line[0], colon[0])).trim(),
    children: itemsBetween(source, [colon, ...inside], line[1]),
  };
};

// Every line must parse as a labelled run, or there is no nested list to
// build and the whole paragraph stays reported.
const promotion = (
  document: DocumentContext,
  run: InterpunctRun,
): DeclaredEdit | null => {
  const { source } = document;
  const paragraph = sourceParagraph(source, run.paragraph);
  const separators = splittableSeparators(
    source,
    paragraph,
    RUN_SEPARATOR,
    run.separators,
  );
  const colons = colonsIn(source, paragraph);
  if (separators === null || colons === null) return null;
  const lines = linesOf(paragraph);
  const parents = lines.flatMap(
    (line) => parentOf(source, line, separators, colons) ?? [],
  );
  if (parents.length !== lines.length) return null;
  return promote({
    source,
    paragraph,
    span: [paragraph.start, paragraph.end],
    leadIn: null,
    items: parents,
    ordered: false,
  });
};

export const checkStackedInterpunctRuns = (
  document: DocumentContext,
): Promise<Diagnostic[]> =>
  Promise.resolve(
    interpunctRuns(document)
      .filter(isStacked)
      .flatMap((run) =>
        withPromotion(
          document,
          [
            runFinding(
              "prose/list-stacked-interpunct-runs",
              run.range,
              `Interpunct runs stacked on ${run.lines} lines; promote them to a nested list.`,
            ),
          ],
          promotion(document, run),
        ),
      ),
  );
