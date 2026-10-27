import type { PolicyRuleId } from "./types.ts";

export const PROSE_RULES: PolicyRuleId[] = [
  "prose/sentence-one-per-line",
  "prose/sentence-word-budget-exceeded",
  "prose/paragraph-sentence-budget-exceeded",
  "prose/list-semicolon-delimited-run",
  "prose/list-interpunct-joined-run",
  "prose/list-inline-enumeration-markers",
  "prose/list-comma-labelled-run",
  "prose/list-comma-code-run",
  "prose/list-comma-plain-run",
  "prose/list-stacked-interpunct-runs",
  "prose/punctuation-em-dash-in-prose",
  "prose/punctuation-interpunct-in-prose",
];
export const MERMAID_RULES: PolicyRuleId[] = [
  "mermaid/contrast-text-below-aa",
  "mermaid/complexity-visual-score-acceptable-exceeded",
];
export const RULES = [...PROSE_RULES, ...MERMAID_RULES];

// The order automatic edits land in, one policy per round. A promotion needs
// the separators a glyph swap would erase, so list policies come before the
// punctuation swaps, and sentence layout settles the blocks last.
export const FIX_ORDER: PolicyRuleId[] = [
  "prose/list-stacked-interpunct-runs",
  "prose/list-inline-enumeration-markers",
  "prose/list-comma-labelled-run",
  "prose/list-comma-code-run",
  "prose/list-comma-plain-run",
  "prose/list-interpunct-joined-run",
  "prose/list-semicolon-delimited-run",
  "prose/punctuation-interpunct-in-prose",
  "prose/punctuation-em-dash-in-prose",
  "prose/sentence-one-per-line",
];
