import assert from "node:assert/strict";
import { test } from "node:test";
import { findingsForRule } from "./diagnostics.ts";
import type { Diagnostic } from "./types.ts";

test("each policy receives only its findings, with parse errors attributed only to Mermaid", () => {
  const prose: Diagnostic = { ruleId: "prose/sentence-one-per-line", message: "Split the line", start: 0, end: 5 };
  const parse: Diagnostic = {
    ruleId: "mermaid/parse-diagram-unparseable",
    message: "Unclosed node",
    start: 10,
    end: 20,
  };
  const contrast: Diagnostic = {
    ruleId: "mermaid/contrast-text-below-aa",
    message: "Unreadable text",
    start: 30,
    end: 40,
  };
  const findings = [prose, parse, contrast];

  assert.deepEqual(findingsForRule(findings, "prose/sentence-one-per-line"), [prose]);
  assert.deepEqual(findingsForRule(findings, "prose/sentence-word-budget-exceeded"), []);
  assert.deepEqual(findingsForRule(findings, "mermaid/contrast-text-below-aa"), [
    {
      ...parse,
      ruleId: "mermaid/contrast-text-below-aa",
      message: "Cannot evaluate mermaid/contrast-text-below-aa: Unclosed node",
    },
    contrast,
  ]);
  assert.equal(parse.ruleId, "mermaid/parse-diagram-unparseable");
});
