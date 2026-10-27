import { createDocument, type DocumentContext, type ParagraphContext, runningProse } from "../document/context.ts";
import { DEFAULT_MIN_INTERPUNCT_ITEMS } from "../document/interpunct-runs.ts";
import { PROSE_RULES } from "../rules.ts";
import type { Diagnostic, PolicyRuleId, RuleOptions } from "../types.ts";
import { minItemsOf } from "./promotion.ts";
import { checkCommaCodeRun } from "./rules/list-comma-code-run.ts";
import { checkCommaLabelledRun } from "./rules/list-comma-labelled-run.ts";
import { checkCommaPlainRun } from "./rules/list-comma-plain-run.ts";
import { checkInlineEnumerationMarkers } from "./rules/list-inline-enumeration-markers.ts";
import { checkInterpunctJoinedRun } from "./rules/list-interpunct-joined-run.ts";
import { checkSemicolonDelimitedRun } from "./rules/list-semicolon-delimited-run.ts";
import { checkStackedInterpunctRuns } from "./rules/list-stacked-interpunct-runs.ts";
import { checkParagraphSentenceBudget } from "./rules/paragraph-sentence-budget-exceeded.ts";
import { checkEmDashInProse } from "./rules/punctuation-em-dash-in-prose.ts";
import { checkInterpunctInProse, type RunOwners } from "./rules/punctuation-interpunct-in-prose.ts";
import { checkSentenceOnePerLine } from "./rules/sentence-one-per-line.ts";
import { checkSentenceWordBudget } from "./rules/sentence-word-budget-exceeded.ts";

export interface ProseOptions extends RuleOptions {
  rules?: readonly PolicyRuleId[];

  // The options of every enabled prose policy, so a policy can defer to
  // another one. When absent, every prose policy is enabled with these options.
  policies?: Readonly<Partial<Record<PolicyRuleId, RuleOptions>>>;
}

type ParagraphCheck = (
  document: DocumentContext,
  paragraph: ParagraphContext,
  options: ProseOptions,
) => Promise<Diagnostic[]>;

interface ProseRule {
  id: PolicyRuleId;
  check(document: DocumentContext, options: ProseOptions): Promise<Diagnostic[]>;
}

// A policy judged one running paragraph at a time.
const eachParagraph =
  (check: ParagraphCheck): ProseRule["check"] =>
  async (document, options) => {
    const diagnostics: Diagnostic[] = [];

    for (const paragraph of document.paragraphs.filter(runningProse)) {
      diagnostics.push(...(await check(document, paragraph, options)));
    }

    return diagnostics;
  };

const INTERPUNCT_RUN: PolicyRuleId = "prose/list-interpunct-joined-run";

const runOwners = (options: ProseOptions): RunOwners => {
  const policies = options.policies ?? Object.fromEntries(PROSE_RULES.map((id) => [id, options]));
  const flat = policies[INTERPUNCT_RUN];

  return {
    flatMinItems: flat ? minItemsOf(flat, DEFAULT_MIN_INTERPUNCT_ITEMS) : null,
    stacked: policies["prose/list-stacked-interpunct-runs"] !== undefined,
  };
};

const implementations: ProseRule[] = [
  {
    id: "prose/sentence-one-per-line",
    check: eachParagraph(checkSentenceOnePerLine),
  },
  {
    id: "prose/sentence-word-budget-exceeded",
    check: eachParagraph((document, paragraph, options) =>
      checkSentenceWordBudget(document, paragraph, options.maxWords),
    ),
  },
  {
    id: "prose/paragraph-sentence-budget-exceeded",
    check: eachParagraph((document, paragraph, options) =>
      checkParagraphSentenceBudget(document, paragraph, options.maxSentences),
    ),
  },
  {
    id: "prose/list-semicolon-delimited-run",
    check: eachParagraph(checkSemicolonDelimitedRun),
  },
  { id: INTERPUNCT_RUN, check: checkInterpunctJoinedRun },
  {
    id: "prose/list-inline-enumeration-markers",
    check: eachParagraph(checkInlineEnumerationMarkers),
  },
  {
    id: "prose/list-comma-labelled-run",
    check: eachParagraph(checkCommaLabelledRun),
  },
  { id: "prose/list-comma-code-run", check: eachParagraph(checkCommaCodeRun) },
  {
    id: "prose/list-comma-plain-run",
    check: eachParagraph(checkCommaPlainRun),
  },
  {
    id: "prose/list-stacked-interpunct-runs",
    check: checkStackedInterpunctRuns,
  },
  { id: "prose/punctuation-em-dash-in-prose", check: checkEmDashInProse },
  {
    id: "prose/punctuation-interpunct-in-prose",
    check: (document, options) => checkInterpunctInProse(document, runOwners(options)),
  },
];

/** Reuse node language views and preserve source offsets; edits are verified before a finding carries them. */
export async function analyzeProse(input: string | DocumentContext, options: ProseOptions = {}): Promise<Diagnostic[]> {
  const document = typeof input === "string" ? createDocument(input) : input;
  const enabled = implementations.filter((rule) => options.rules === undefined || options.rules.includes(rule.id));
  const diagnostics: Diagnostic[] = [];

  for (const rule of enabled) {
    diagnostics.push(...(await rule.check(document, options)));
  }

  document.validateBatch(diagnostics);

  return diagnostics.sort((a, b) => a.start - b.start || a.ruleId.localeCompare(b.ruleId));
}
