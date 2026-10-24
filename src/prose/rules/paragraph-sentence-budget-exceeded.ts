import {
  type DocumentContext,
  endOf,
  type ParagraphContext,
  startOf,
} from "../../document/context.ts";
import type { Diagnostic } from "../../types.ts";
import { paragraphPlan } from "../paragraph-plan.ts";

export async function checkParagraphSentenceBudget(
  document: DocumentContext,
  { node }: ParagraphContext,
  budget = 5,
): Promise<Diagnostic[]> {
  if (!Number.isInteger(budget) || budget < 1)
    throw new RangeError("maxSentences must be a positive integer");
  const sentences = await document.language(node).sentences;
  if (sentences.length <= budget) return [];
  const plan = paragraphPlan(sentences, budget);
  const topics = sentences
    .map(
      (sentence, i) =>
        `${i + 1}: ${[...sentence.terms].slice(0, 4).join(", ") || "(no content terms)"}`,
    )
    .join("; ");
  return [
    {
      ruleId: "prose/paragraph-sentence-budget-exceeded",
      start: startOf(node),
      end: endOf(node),
      message: `Paragraph has ${sentences.length} sentences (budget ${budget}). Compromise content-word lemmas suggest about ${plan.topics} lexical topic groups. Consider paragraph breaks after sentences ${plan.breaks.join(", ")}. Topic cues: ${topics}. These are lexical-cohesion hints, not semantic certainty; keep dependent sentences together.`,
    },
  ];
}
