# remark-lint-stopslop

Remark preset and plugin for Markdown linting, concise prose, and Mermaid diagram analysis. It provides the upstream recommended remark-lint preset plus five opt-in policies for prose layout, sentence and paragraph budgets, Mermaid contrast, and visual complexity.

Requires Node.js 24 or newer, or Bun 1.3 or newer.

## Install

```sh
bun add -d remark-lint-stopslop remark-cli
```

## Use the preset

The default export enables GitHub Flavored Markdown and the recommended remark-lint rules:

```js
import docLint from "remark-lint-stopslop";

export default { plugins: [docLint] };
```

## Enable custom policies

Import the remark plugin to enable the five custom policies:

```js
import docLint from "remark-lint-stopslop/remark";

export default {
  plugins: [[docLint, {
    options: { maxWords: 25, maxSentences: 5 },
    rules: { "sentence-word-budget-exceeded": { maxWords: 20 } }
  }]]
};
```

Every enabled custom policy reports an error. Only `sentence-one-per-line` supports automatic edits with `{fix: true}`. See [RULES.md](RULES.md) for policy behaviour and fixer limits.

## Develop

```sh
bun install
bun run check
```

See [architecture](ARCHITECTURE.md), [contributing](CONTRIBUTING.md), [Mermaid analysis](src/mermaid/README.md), and [split planning](src/mermaid/splitting/README.md).
