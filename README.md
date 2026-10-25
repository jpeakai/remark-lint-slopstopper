# remark-lint-slopstopper

Remark preset and plugin for Markdown linting, concise prose, and Mermaid diagram analysis.
It provides the upstream recommended remark-lint preset plus opt-in custom policies.
They cover prose layout, sentence and paragraph budgets, hidden lists, punctuation, Mermaid contrast and visual complexity.

Requires Node.js 24 or newer, or Bun 1.3 or newer.

## Install

```sh
bun add -d remark-lint-slopstopper remark-cli
```

## Use the preset

The default export enables GitHub Flavored Markdown and the recommended remark-lint rules:

```js
import slopstopper from "remark-lint-slopstopper";

export default { plugins: [slopstopper] };
```

## Enable custom policies

Import the remark plugin to enable the custom policies:

```js
import slopstopper from "remark-lint-slopstopper/remark";

export default {
  plugins: [[slopstopper, {
    options: { maxWords: 25, maxSentences: 5 },
    rules: {
      "sentence-word-budget-exceeded": { maxWords: 20 },
      "list-comma-plain-run": { minItems: 4 }
    }
  }]]
};
```

Every enabled custom policy reports an error.
Sentence layout, list promotion and punctuation policies offer automatic edits with `{fix: true}`.
Each edit is verified by reparsing before it is applied.
The list run policies take a per-rule `minItems` threshold.
See [RULES.md](RULES.md) for policy behaviour, defaults and fixer limits.

## Run with bunx

The package ships TypeScript source, so pass `--bun` to run `remark-cli` on the Bun runtime:

```sh
bunx --bun remark-cli --no-stdout --frail docs/
```

remark loads `.remarkrc.mjs` from the working directory. Pass `--rc-path` to use another config, and `--output` to write fixes back to the files:

```sh
bunx --bun remark-cli --rc-path examples/remark-fix.config.mjs --output docs/
```

The config imports this package, so install it in the linted project first.

## Develop

```sh
bun install
bun run check
```

See [architecture](ARCHITECTURE.md), [contributing](CONTRIBUTING.md), [Mermaid analysis](src/mermaid/README.md), and [split planning](src/mermaid/splitting/README.md).
