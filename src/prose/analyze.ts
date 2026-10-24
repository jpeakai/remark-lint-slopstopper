import {
  createDocument,
  type DocumentContext,
  type ParagraphContext,
  runningProse,
} from "../document/context.ts";
import type { Diagnostic, PolicyRuleId } from "../types.ts";
import { checkParagraphSentenceBudget } from "./rules/paragraph-sentence-budget-exceeded.ts";
import { checkSentenceOnePerLine } from "./rules/sentence-one-per-line.ts";
import { checkSentenceWordBudget } from "./rules/sentence-word-budget-exceeded.ts";

export interface ProseOptions {
  maxWords?: number;
  maxSentences?: number;
  rules?: readonly PolicyRuleId[];
}

interface ProseRule {
  id: PolicyRuleId;
  check(
    document: DocumentContext,
    paragraph: ParagraphContext,
    budgets: ProseOptions,
  ): Promise<Diagnostic[]>;
}

const implementations: ProseRule[] = [
  { id: "prose/sentence-one-per-line", check: checkSentenceOnePerLine },
  {
    id: "prose/sentence-word-budget-exceeded",
    check: (document, paragraph, budgets) =>
      checkSentenceWordBudget(document, paragraph, budgets.maxWords),
  },
  {
    id: "prose/paragraph-sentence-budget-exceeded",
    check: (document, paragraph, budgets) =>
      checkParagraphSentenceBudget(document, paragraph, budgets.maxSentences),
  },
];

/** Reuse node language views and preserve source offsets; only layout exposes edits. */
export async function analyzeProse(
  input: string | DocumentContext,
  options: ProseOptions = {},
): Promise<Diagnostic[]> {
  const document = typeof input === "string" ? createDocument(input) : input;
  const enabled = implementations.filter(
    (rule) => options.rules === undefined || options.rules.includes(rule.id),
  );
  const diagnostics: Diagnostic[] = [];
  for (const paragraph of document.paragraphs.filter(runningProse)) {
    for (const rule of enabled)
      diagnostics.push(...(await rule.check(document, paragraph, options)));
  }
  document.validateBatch(diagnostics);
  return diagnostics.sort(
    (a, b) => a.start - b.start || a.ruleId.localeCompare(b.ruleId),
  );
}
