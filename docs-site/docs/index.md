<div class="hero" markdown>

<p class="eyebrow">@jpeakai/remark-lint-slopstopper</p>

# Clear prose.<br>Readable diagrams.

<p class="lead">Check Markdown with one CLI or your existing remark pipeline. Find hidden lists, long sentences and Mermaid diagrams that are hard to read.</p>

[Get started](get-started.md){ .md-button .md-button--primary }
[Browse the rules](RULES.md){ .md-button }

</div>

## Choose your checks

The [standalone CLI](docs/cli.md) enables the recommended Markdown rules and all Custom Policies without a config file.
Use its flags to select policy groups and tune shared budgets.

The package has two entry points.
Use either one, or combine them in the same remark configuration.

| Entry point | What it checks | When to use it |
| --- | --- | --- |
| `@jpeakai/remark-lint-slopstopper` | The upstream recommended Markdown rules, with GFM parsing | Check Markdown structure |
| `@jpeakai/remark-lint-slopstopper/remark` | Twelve prose policies and two Mermaid policies | Check readability and apply verified prose edits |

Every enabled Custom Policy reports an error.
The [configuration guide](guides/configuration.md) shows how to select policies and tune budgets.

## Turn a hidden list into a list

With `fix: true`, a List Promotion can expose structure without rewriting the items.

=== "Before"

    ```markdown
    Stages: `parse`, `analyse`, `report`.
    ```

=== "After"

    ```markdown
    Stages:

    - `parse`
    - `analyse`
    - `report`
    ```

Each edit passes a structural comparison before it is applied.
Ambiguous input keeps its finding for manual review.
[Understand the fix contract](guides/fixes.md).

## Find your next page

<div class="grid cards" markdown>

- **[Run your first check](get-started.md)**

    Create a remark config, lint a file and read its finding.

- **[Configure your policies](guides/configuration.md)**

    Set sentence budgets, list thresholds and rule suppression.

- **[Compare worked examples](examples/index.md)**

    See prose edits and diagram findings before changing your documents.

- **[Look up a contract](reference/index.md)**

    Find rule options, exported APIs and shared terminology.

</div>

## Check diagrams without changing them

Mermaid policies inspect text contrast in light and dark themes and measure visual complexity.
A finding can include a verified Split Plan when a diagram has useful internal boundaries.
Diagrams remain unchanged in fix mode.

See [Mermaid findings](examples/mermaid.md) for examples and the [rule reference](RULES.md#mermaid-text-contrast) for limits.

## Runtime and scope

The package ships TypeScript source.
Use Bun 1.3 or newer, or Node.js 24 or newer.
The CLI examples use Bun to run `remark-cli`.

These checks measure specific text and diagram properties.
They do not establish factual accuracy or replace editorial review.
