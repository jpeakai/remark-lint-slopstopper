import type { Root } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMessageControl from "remark-message-control";
import type { Processor, Transformer } from "unified";
import type { VFile } from "vfile";
import type { VFileMessage } from "vfile-message";
import { findingsForRule } from "../diagnostics.ts";
import { createDocument, type DocumentContext } from "../document/context.ts";
import { applyEdits } from "../document/edits.ts";
import { pointAt } from "../document/positions.ts";
import { analyzeProse } from "../prose/analyze.ts";
import { FIXABLE_RULE, PROSE_RULES, RULES } from "../rules.ts";
import type {
  Diagnostic,
  PolicyRuleId,
  RuleOptions,
  TextEdit,
} from "../types.ts";

type ShortRuleId = PolicyRuleId extends `${string}/${infer Name}`
  ? Name
  : never;
type Severity = boolean | 0 | 2 | "off" | "error";
export type RemarkRuleSetting =
  | Severity
  | RuleOptions
  | [Severity, RuleOptions?];

export interface RemarkStopslopOptions {
  fix?: boolean;
  options?: RuleOptions;
  rules?: Partial<Record<ShortRuleId, RemarkRuleSetting>>;
}

interface Setting {
  options: RuleOptions;
}

interface RuleConfiguration extends Setting {
  ruleId: PolicyRuleId;
}

interface Report {
  emitted: Map<VFileMessage, Diagnostic>;
  visible: VFileMessage[];
}

type ReportDiagnostics = (tree: Root, file: VFile) => Promise<Report>;

function setting(value: RemarkRuleSetting | undefined): Setting | null {
  if (value === false || value === "off" || value === 0) return null;
  if (Array.isArray(value)) {
    const severity = setting(value[0]);
    return severity ? { ...severity, options: value[1] ?? {} } : null;
  }
  return {
    options: typeof value === "object" && value !== null ? value : {},
  };
}

const shortName = (ruleId: PolicyRuleId): ShortRuleId =>
  ruleId.split("/")[1] as ShortRuleId;

function configuredRules(options: RemarkStopslopOptions): RuleConfiguration[] {
  return RULES.flatMap((ruleId) => {
    const config = setting(options.rules?.[shortName(ruleId)]);
    return config ? [{ ruleId, ...config }] : [];
  });
}

async function diagnostics(
  document: DocumentContext,
  config: RuleConfiguration,
  defaults: RuleOptions = {},
): Promise<Diagnostic[]> {
  const options = { ...defaults, ...config.options, rules: [config.ruleId] };
  const findings = PROSE_RULES.includes(config.ruleId)
    ? await analyzeProse(document, options)
    : await (await import("../mermaid/analyze.ts")).analyzeMermaid(
        document,
        options,
      );
  return findingsForRule(findings, config.ruleId);
}

function emitDiagnostics(
  file: VFile,
  config: RuleConfiguration,
  diagnostics: Diagnostic[],
  emitted: Report["emitted"],
): void {
  const source = String(file);
  for (const diagnostic of diagnostics) {
    const message = file.message(
      diagnostic.message,
      {
        start: pointAt(source, diagnostic.start),
        end: pointAt(source, diagnostic.end),
      },
      `remark-lint:${shortName(config.ruleId)}`,
    );
    message.fatal = true;
    emitted.set(message, diagnostic);
  }
}

function reporter(options: RemarkStopslopOptions): ReportDiagnostics {
  const settings = configuredRules(options);
  const control = remarkMessageControl({
    name: "lint",
    source: "remark-lint",
    known: RULES.map(shortName),
  });
  return async (tree, file) => {
    const document = createDocument(String(file), { tree, cwd: file.cwd });
    const emitted: Report["emitted"] = new Map();
    for (const config of settings)
      emitDiagnostics(
        file,
        config,
        await diagnostics(document, config, options.options),
        emitted,
      );
    // Native suppression controls both messages and the source edits they expose.
    control(tree, file);
    return {
      emitted,
      visible: file.messages.filter((message) => emitted.has(message)),
    };
  };
}

function visibleEdits({ emitted, visible }: Report): TextEdit[] {
  return visible.flatMap((message) => {
    const diagnostic = emitted.get(message);
    return diagnostic?.ruleId === FIXABLE_RULE && diagnostic.fix
      ? [diagnostic.fix]
      : [];
  });
}

function applyRound(file: VFile, report: Report): TextEdit[] | null {
  const edits = visibleEdits(report);
  if (!edits.length) return null;
  const next = applyEdits(String(file), edits);
  if (next === String(file)) return null;
  file.messages = file.messages.filter(
    (message) => !report.emitted.has(message),
  );
  file.value = next;
  return edits;
}

function transformer(
  processor: Processor,
  options: RemarkStopslopOptions,
): Transformer<Root> {
  const report = reporter(options);
  return async (tree, file) => {
    let currentTree = tree;
    const applied: TextEdit[] = [];
    while (true) {
      const current = await report(currentTree, file);
      if (!options.fix) break;
      const edits = applyRound(file, current);
      if (!edits) break;
      applied.push(...edits);
      currentTree = processor.parse(file) as Root;
    }
    if (options.fix) {
      // A Markdown serializer could reformat unrelated bytes. Compile the
      // verified source edits, even if remark-stringify is also installed.
      processor.compiler = (_tree, currentFile) => String(currentFile);
      file.data.stopslopFixes = applied;
    }
    return currentTree;
  };
}

/** Native remark/VFile diagnostics, with opt-in source-preserving whitespace fixes. */
export default function remarkStopslop(
  this: Processor,
  options: RemarkStopslopOptions = {},
): Transformer<Root> {
  this.use(remarkGfm).use(remarkFrontmatter, ["yaml", "toml"]);
  return transformer(this, options);
}
