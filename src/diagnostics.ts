import { MERMAID_RULES } from "./rules.ts";
import type { Diagnostic, PolicyRuleId } from "./types.ts";

export function findingsForRule(diagnostics: Diagnostic[], ruleId: PolicyRuleId): Diagnostic[] {
  return diagnostics.flatMap((diagnostic) => {
    if (diagnostic.ruleId === ruleId) {
      return [diagnostic];
    }

    if (MERMAID_RULES.includes(ruleId) && diagnostic.ruleId === "mermaid/parse-diagram-unparseable") {
      return [
        {
          ...diagnostic,
          ruleId,
          message: `Cannot evaluate ${ruleId}: ${diagnostic.message}`,
        },
      ];
    }

    return [];
  });
}
