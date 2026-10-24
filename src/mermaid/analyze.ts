import { createDocument, type DocumentContext } from "../document/context.ts";
import type { Diagnostic, PolicyRuleId, RuleOptions } from "../types.ts";
import { COMPLEXITY_RULE, reportComplexity } from "./complexity/policy.ts";
import { CONTRAST_RULE, reportContrast } from "./contrast/policy.ts";
import { type Fence, fences, sourceLocation } from "./markdown.ts";
import { extractStats } from "./parsing/statistics.ts";
import type { Report } from "./report.ts";

export const MERMAID_RULES = {
  contrast: CONTRAST_RULE,
  complexity: COMPLEXITY_RULE,
  parse: "mermaid/parse-diagram-unparseable",
} as const;
export interface MermaidOptions extends RuleOptions {
  rules?: readonly PolicyRuleId[];
}
let queue: Promise<unknown> = Promise.resolve();
// Mermaid owns mutable parser and theme singletons, so analysis is serialized.
export function analyzeMermaid(
  input: string | DocumentContext,
  options: MermaidOptions = {},
): Promise<Diagnostic[]> {
  const job = queue.then(() =>
    analyze(typeof input === "string" ? createDocument(input) : input, options),
  );
  queue = job.catch(() => undefined);
  return job;
}
async function analyze(
  document: DocumentContext,
  options: MermaidOptions,
): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  if (
    options.rules &&
    !options.rules.some(
      (rule) => rule === CONTRAST_RULE || rule === COMPLEXITY_RULE,
    )
  )
    return out;
  const { source } = document;
  for (const node of fences(document)) {
    const report: Report = (ruleId, message, line = 1) => {
      out.push({ ruleId, message, ...sourceLocation(source, node, line) });
    };
    await analyzeFence(node, options, report);
  }
  return out;
}
async function analyzeFence(
  node: Fence,
  options: MermaidOptions,
  report: Report,
): Promise<void> {
  const stats = await extractStats(node.value);
  if (stats.error) {
    report(
      MERMAID_RULES.parse,
      `Mermaid cannot parse this diagram: ${stats.error}. Correct the Mermaid syntax before checking contrast or complexity.`,
      stats.error_line ?? 1,
    );
    return;
  }
  if (!options.rules || options.rules.includes(COMPLEXITY_RULE))
    await reportComplexity(node.value, stats, options, report);
  if (!options.rules || options.rules.includes(CONTRAST_RULE))
    await reportContrast(node.value, stats, options, report);
}
