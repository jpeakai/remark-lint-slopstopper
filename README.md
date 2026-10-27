# remark-lint-slopstopper

Standalone CLI, remark preset and plugin for Markdown linting, concise prose, and Mermaid diagram analysis.
It provides the upstream recommended remark-lint preset plus opt-in custom policies.
They cover prose layout, sentence and paragraph budgets, hidden lists, punctuation, Mermaid contrast and visual complexity.

Requires Node.js 24 or newer, or Bun 1.3 or newer.

## Install

The package is not currently published to npm.
Build the local checkout first:

```sh
bun install
bun run build
node dist/cli.js --help
```

## Run the standalone CLI

The standalone CLI enables the recommended Markdown rules and all Custom Policies without a config:

```sh
node dist/cli.js docs/
node dist/cli.js --fix docs/
node dist/cli.js --prose-only --max-words 20 --json README.md
```

After publication, run the package directly:

```sh
bunx @jpeakai/remark-lint-slopstopper --help
```

See [the CLI reference](docs/cli.md) for flags, configuration precedence, input discovery and exit codes.
The plugin entry points below remain available for an existing remark pipeline.

## Use the preset

The default export enables GitHub Flavored Markdown and the recommended remark-lint rules:

```js
import slopstopper from "@jpeakai/remark-lint-slopstopper";

export default { plugins: [slopstopper] };
```

## Enable custom policies

Import the remark plugin to enable the custom policies:

```js
import slopstopper from "@jpeakai/remark-lint-slopstopper/remark";

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

## Run through remark-cli

The package ships TypeScript source, so pass `--bun` to run `remark-cli` on the Bun runtime:

```sh
bunx --bun remark-cli --no-stdout --frail docs/
```

remark loads `.remarkrc.mjs` from the working directory. Pass `--rc-path` to use another config, and `--output` to write fixes back to the files:

```sh
bunx --bun remark-cli --rc-path examples/remark-fix.config.mjs --output docs/
```

This optional route needs both this package and `remark-cli` installed in the linted project.
The standalone CLI already supplies its engine.

## Develop

```sh
bun install
bun run check
```

## Preview the documentation

Run `make site-serve` and open <http://127.0.0.1:8010/>.
The site includes guides, examples, rules, architecture and Decision Records.
See [the site workflow](docs/documentation-site.md) for build and editing commands.

See [architecture](ARCHITECTURE.md), [contributing](CONTRIBUTING.md), [Mermaid analysis](src/mermaid/README.md), and [split planning](src/mermaid/splitting/README.md).
