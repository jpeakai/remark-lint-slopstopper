import type { DocumentContext } from "../../document/context.ts";
import type { DeclaredEdit } from "../../document/edits.ts";
import {
  DEFAULT_MIN_INTERPUNCT_ITEMS,
  type InterpunctRun,
  interpunctRuns,
  isFlatList,
  RUN_SEPARATOR,
} from "../../document/interpunct-runs.ts";
import { first, last, type Range, wordsIn } from "../../document/ranges.ts";
import {
  colonsBefore,
  colonsIn,
  sentenceSpan,
  sourceParagraph,
  splittableSeparators,
} from "../../document/source-text.ts";
import type { Diagnostic, RuleOptions } from "../../types.ts";
import {
  cleanLeadIn,
  itemsBetween,
  minItemsOf,
  promote,
  runFinding,
  withPromotion,
} from "../promotion.ts";

// A last item this much longer than every other is a sentence that follows
// the list, not a member of it.
const tailIsProse = (items: string[]): boolean =>
  wordsIn(last(items)) >
  Math.max(8, 3 * Math.max(...items.slice(0, -1).map(wordsIn)));

// Without a colon, a first item longer than the rest ("Built with Bun")
// carries a clause the list would strip of its meaning.
const headIsProse = (items: string[]): boolean =>
  wordsIn(first(items)) > Math.max(...items.slice(1).map(wordsIn));

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
  const span = sentenceSpan(
    source,
    paragraph,
    first(separators)[0],
    last(separators)[1],
  );
  // The innermost colon before the first item, so a lead-in that itself
  // holds a colon keeps only its final clause.
  const colon = colonsBefore(colons, span, first(separators)[0]).pop();
  // With no colon to announce it, the run has to be the whole paragraph.
  const whole = span[0] === paragraph.start && span[1] === paragraph.end;
  if (!(colon || whole)) return null;
  const cuts: Range[] = [colon ?? [span[0], span[0]], ...separators];
  const items = itemsBetween(source, cuts, span[1]);
  if (tailIsProse(items) || (!colon && headIsProse(items))) return null;
  return promote({
    source,
    paragraph,
    span,
    leadIn: colon ? cleanLeadIn(source.slice(span[0], colon[0])) : null,
    items: items.map((text) => ({ text })),
    ordered: false,
  });
};

export const checkInterpunctJoinedRun = (
  document: DocumentContext,
  options: RuleOptions,
): Promise<Diagnostic[]> => {
  const minItems = minItemsOf(options, DEFAULT_MIN_INTERPUNCT_ITEMS);
  const findings = interpunctRuns(document)
    .filter((run) => isFlatList(run, minItems))
    .flatMap((run) =>
      withPromotion(
        document,
        [
          runFinding(
            "prose/list-interpunct-joined-run",
            run.range,
            `Interpunct-joined inline list (${run.separators + 1} items); promote the items to a bullet list.`,
          ),
        ],
        promotion(document, run),
      ),
    );
  return Promise.resolve(findings);
};
