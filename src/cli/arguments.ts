import { parseArgs } from "node:util";
import type { RemarkSlopstopperOptions } from "../remark/plugin.ts";
import { MERMAID_RULES, PROSE_RULES, RULES } from "../rules.ts";

const options = {
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
  fix: { type: "boolean" },
  json: { type: "boolean" },
  config: { type: "string" },
  "no-config": { type: "boolean" },
  "ignore-path": { type: "string" },
  "max-words": { type: "string" },
  "max-sentences": { type: "string" },
  "min-items": { type: "string" },
  preset: { type: "string" },
  "disable-rule": { type: "string", multiple: true },
  "prose-only": { type: "boolean" },
  "mermaid-only": { type: "boolean" },
  "list-rules": { type: "boolean" },
  "stdin-filepath": { type: "string" },
} as const;

export function argumentsOf(args: string[]) {
  const result = parseArgs({ args, options, allowPositionals: true });
  const { values, positionals } = result;

  if (values["prose-only"] && values["mermaid-only"]) {
    throw new Error("Choose either --prose-only or --mermaid-only");
  }

  if (values.config && values["no-config"]) {
    throw new Error("--config cannot be combined with --no-config");
  }

  if (positionals.length && values["stdin-filepath"]) {
    throw new Error("--stdin-filepath requires stdin instead of file arguments");
  }

  if (!positionals.length && values.fix) {
    throw new Error("--fix requires file arguments; stdin is check-only");
  }

  return result;
}

export type CliArguments = ReturnType<typeof argumentsOf>;

function positive(value: string | undefined, name: string, minimum = 1) {
  if (value === undefined) {
    return;
  }

  const number = Number(value);

  if (!(/^\d+$/.test(value) && Number.isSafeInteger(number)) || number < minimum) {
    throw new Error(`--${name} requires a whole number of at least ${minimum}`);
  }

  return number;
}

function disabledRules(values: CliArguments["values"]) {
  const rules: NonNullable<RemarkSlopstopperOptions["rules"]> = {};
  const group = values["prose-only"] ? MERMAID_RULES : [];
  const disabled = values["mermaid-only"] ? PROSE_RULES : group;

  for (const id of disabled) {
    rules[id.split("/")[1] as keyof typeof rules] = false;
  }

  for (const name of values["disable-rule"] ?? []) {
    const id = RULES.find((id) => id.split("/")[1] === name);

    if (!id) {
      throw new Error(`Unknown custom rule: ${name}`);
    }

    rules[name as keyof typeof rules] = false;
  }

  return rules;
}

export function pluginOptions({ values }: CliArguments): RemarkSlopstopperOptions {
  const shared = {
    maxWords: positive(values["max-words"], "max-words"),
    maxSentences: positive(values["max-sentences"], "max-sentences"),
    minItems: positive(values["min-items"], "min-items", 2),
    preset: values.preset,
  };

  if (values.preset && !["low-density", "medium-density", "high-density"].includes(values.preset)) {
    throw new Error("--preset must be low-density, medium-density or high-density");
  }

  return {
    fix: values.fix ?? false,
    options: Object.fromEntries(Object.entries(shared).filter(([, value]) => value !== undefined)),
    rules: disabledRules(values),
  };
}
