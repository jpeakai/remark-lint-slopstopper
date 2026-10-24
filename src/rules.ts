import type { PolicyRuleId } from "./types.ts";

export const PROSE_RULES: PolicyRuleId[] = [
  "prose/sentence-one-per-line",
  "prose/sentence-word-budget-exceeded",
  "prose/paragraph-sentence-budget-exceeded",
];
export const MERMAID_RULES: PolicyRuleId[] = [
  "mermaid/contrast-text-below-aa",
  "mermaid/complexity-visual-score-acceptable-exceeded",
];
export const RULES = [...PROSE_RULES, ...MERMAID_RULES];
export const FIXABLE_RULE = PROSE_RULES[0];
