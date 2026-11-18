import { readFile } from "node:fs/promises";
import { join } from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { VFile } from "vfile";
import remarkSlopstopper from "../../src/remark/plugin.ts";
import { canonicalExample } from "./paths.ts";

// Strict lint acceptance: every selected comparison, and all of them as one
// document, must report zero Diagnostics through the package's own remark
// adapter with every policy at its default. No Finding Budget applies, and
// every selected file is read explicitly, so nothing can be ignored.

export interface LintDiagnostic {
  // The example the Diagnostic belongs to, or "combined" for the joint document.
  example: string;
  rule: string;
  line?: number;
  column?: number;
  message: string;
}

export interface StrictLint {
  passed: boolean;
  diagnostics: LintDiagnostic[];
}

// A message-control comment could silence a policy, so strict mode refuses it.
const CONTROL = /<!--\s*lint\s+(disable|ignore|enable)\b[^>]*-->/g;

async function lint(example: string, markdown: string): Promise<LintDiagnostic[]> {
  const processor = unified().use(remarkParse).use(remarkSlopstopper);
  const file = new VFile({ value: markdown });

  await processor.run(processor.parse(file), file);

  const controls = [...markdown.matchAll(CONTROL)].map((match) => ({
    example,
    rule: "strict/message-control",
    line: markdown.slice(0, match.index).split("\n").length,
    message: `lint control comment ${match[0]} is not allowed in strict mode`,
  }));

  return [
    ...file.messages.map((message) => ({
      example,
      rule: message.ruleId ? `${message.source ?? "remark-lint"}/${message.ruleId}` : String(message.source),
      ...(message.line ? { line: message.line } : {}),
      ...(message.column ? { column: message.column } : {}),
      message: message.reason,
    })),
    ...controls,
  ];
}

export async function strictLint(root: string, names: readonly string[]): Promise<StrictLint> {
  const sources: string[] = [];
  const diagnostics: LintDiagnostic[] = [];

  for (const name of names) {
    await canonicalExample(root, name);

    const source = await readFile(join(root, "examples", name, "diagram-fixed.md"), "utf8");

    sources.push(source);
    diagnostics.push(...(await lint(name, source)));
  }

  if (names.length > 1) {
    diagnostics.push(...(await lint("combined", sources.join("\n\n"))));
  }

  return { passed: diagnostics.length === 0, diagnostics };
}

export const describeDiagnostic = (d: LintDiagnostic): string =>
  `${d.example}${d.line ? `:${d.line}${d.column ? `:${d.column}` : ""}` : ""} ${d.rule}: ${d.message}`;
