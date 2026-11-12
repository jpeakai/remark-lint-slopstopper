#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { parseOptions } from "./cli.ts";
import { failureExitCode, repairExamples } from "./repair.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));

async function main(): Promise<void> {
  await repairExamples(root, parseOptions(process.argv.slice(2)));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = failureExitCode(process.exitCode);
});
