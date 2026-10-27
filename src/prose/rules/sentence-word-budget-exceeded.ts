import { type DocumentContext, endOf, type ParagraphContext, startOf } from "../../document/context.ts";
import type { Diagnostic } from "../../types.ts";

export async function checkSentenceWordBudget(
  document: DocumentContext,
  { node }: ParagraphContext,
  budget = 25,
): Promise<Diagnostic[]> {
  if (!Number.isInteger(budget) || budget < 1) {
    throw new RangeError("maxWords must be a positive integer");
  }

  const view = document.projection(node);
  const sentences = await document.language(node).sentences;
  const end = endOf(node);

  return sentences
    .filter((sentence) => sentence.wordCount > budget)
    .map((sentence) => {
      const target = Math.max(2, sentence.clauses, Math.ceil(sentence.wordCount / budget));

      return {
        ruleId: "prose/sentence-word-budget-exceeded",
        start: view.offsets[sentence.start] ?? startOf(node),
        end: Math.min(end, view.endOffsets[sentence.end - 1] ?? end),
        message: `Sentence has ${sentence.wordCount} words (budget ${budget}); compromise and clause markers suggest ${sentence.clauses} potential clauses. Split into about ${target} shorter sentences, one idea each. Clause counts are heuristic; preserve the original meaning.`,
      };
    });
}
