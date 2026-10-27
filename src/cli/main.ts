#!/usr/bin/env node
import metadata from "../../package.json" with { type: "json" };
import { RULES } from "../rules.ts";
import { argumentsOf } from "./arguments.ts";
import { HELP } from "./help.ts";
import { run } from "./run.ts";

try {
  const args = argumentsOf(process.argv.slice(2));

  if (args.values.help) {
    process.stdout.write(HELP);
  } else if (args.values.version) {
    process.stdout.write(`${metadata.name} ${metadata.version}\n`);
  } else if (args.values["list-rules"]) {
    process.stdout.write(`${RULES.join("\n")}\n`);
  } else if (!args.positionals.length && process.stdin.isTTY) {
    process.stdout.write(HELP);
  } else {
    process.exitCode = await run(args, process.cwd());
  }
} catch (error) {
  process.stderr.write(`remark-lint-slopstopper: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
