import assert from "node:assert/strict";
import { test } from "node:test";
import { argumentsOf, pluginOptions } from "./arguments.ts";

test("CLI budgets use validated integers and preserve quoted glob arguments", () => {
  const args = argumentsOf([
    "--max-words",
    "12",
    "--max-sentences",
    "2",
    "--min-items",
    "4",
    "--preset",
    "low-density",
    "docs/**/*.md",
  ]);
  assert.deepEqual(args.positionals, ["docs/**/*.md"]);
  assert.deepEqual(pluginOptions(args), {
    fix: false,
    options: {
      maxWords: 12,
      maxSentences: 2,
      minItems: 4,
      preset: "low-density",
    },
    rules: {},
  });
  for (const value of ["0", "-1", "2.5", "NaN", "9007199254740992", ""]) {
    assert.throws(
      () => pluginOptions(argumentsOf([`--max-words=${value}`])),
      /whole number/,
    );
  }
  assert.throws(
    () => pluginOptions(argumentsOf(["--min-items", "1"])),
    /at least 2/,
  );
  assert.throws(
    () => pluginOptions(argumentsOf(["--preset", "unknown"])),
    /--preset/,
  );
});

test("CLI rule modes disable only their custom-policy groups", () => {
  const prose = pluginOptions(
    argumentsOf(["--prose-only", "--disable-rule", "sentence-one-per-line"]),
  );
  assert.equal(prose.rules?.["contrast-text-below-aa"], false);
  assert.equal(prose.rules?.["sentence-one-per-line"], false);
  assert.equal(prose.rules?.["sentence-word-budget-exceeded"], undefined);
  const mermaid = pluginOptions(
    argumentsOf(["--mermaid-only", "--disable-rule", "contrast-text-below-aa"]),
  );
  assert.equal(mermaid.rules?.["sentence-one-per-line"], false);
  assert.equal(mermaid.rules?.["contrast-text-below-aa"], false);
  assert.equal(
    mermaid.rules?.["complexity-visual-score-acceptable-exceeded"],
    undefined,
  );
  assert.throws(
    () => pluginOptions(argumentsOf(["--disable-rule", "missing"])),
    /Unknown custom rule/,
  );
});

test("CLI rejects contradictory and incomplete invocations", () => {
  for (const args of [
    ["--prose-only", "--mermaid-only"],
    ["--config", "config.mjs", "--no-config"],
    ["--stdin-filepath", "input.md", "file.md"],
    ["--fix"],
    ["--unknown"],
    ["--max-words"],
  ])
    assert.throws(() => argumentsOf(args));
  assert.equal(pluginOptions(argumentsOf(["--fix", "file.md"])).fix, true);
});
