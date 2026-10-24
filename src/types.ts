export type PolicyRuleId =
  | "prose/sentence-one-per-line"
  | "prose/sentence-word-budget-exceeded"
  | "prose/paragraph-sentence-budget-exceeded"
  | "mermaid/contrast-text-below-aa"
  | "mermaid/complexity-visual-score-acceptable-exceeded";

export type RuleId = PolicyRuleId | "mermaid/parse-diagram-unparseable";

export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export interface Diagnostic {
  ruleId: RuleId;
  message: string;
  start: number;
  end: number;
  fix?: TextEdit;
}

export interface RuleOptions {
  maxWords?: number;
  maxSentences?: number;
  preset?: string;
  canvas?: { light?: string; dark?: string };
  complexity?: Readonly<Record<string, unknown>>;
  [key: string]: unknown;
}
