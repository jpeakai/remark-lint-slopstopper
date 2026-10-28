# Standalone CLI

The package includes a CLI that runs the recommended remark-lint preset and all Custom Policies without a configuration file.
It supplies the engine itself, so a separate `remark-cli` installation is optional.

## Run the CLI

Install the package, then run its binary:

```sh
npm install --save-dev @jpeakai/remark-lint-slopstopper
npx remark-lint-slopstopper --help
```

Run it without installing through the scoped name:

```sh
bunx @jpeakai/remark-lint-slopstopper docs/
npx @jpeakai/remark-lint-slopstopper docs/
```

## Select inputs

Pass files, directories or quoted globs:

```sh
npx remark-lint-slopstopper README.md docs/ "guides/**/*.md"
```

Directory discovery includes Markdown extensions and uses `.remarkignore`.
An explicitly named ignored file reports an error.
With no file arguments, the CLI reads standard input.
Use `--stdin-filepath` to give that input a path for diagnostics and configuration lookup:

```sh
printf 'First sentence. Second sentence.\n' | npx remark-lint-slopstopper --json --stdin-filepath draft.md
```

Standard input is check-only.
The CLI does not echo the document to standard output.

## Options

| Flag | Behaviour |
| --- | --- |
| `--help`, `-h` | Print usage and examples |
| `--version`, `-v` | Print the package name and version |
| `--fix` | Write verified prose edits to the input files |
| `--json` | Print JSON findings to standard output |
| `--max-words N` | Override the shared sentence word budget |
| `--max-sentences N` | Override the shared paragraph sentence budget |
| `--min-items N` | Override shared list thresholds with an integer of at least two |
| `--preset NAME` | Select `low-density`, `medium-density` or `high-density` |
| `--prose-only` | Disable Mermaid Custom Policies |
| `--mermaid-only` | Disable prose Custom Policies |
| `--disable-rule NAME` | Disable a Custom Policy by short name; repeat for several rules |
| `--list-rules` | Print every Custom Policy identifier |
| `--config PATH` | Load an explicit remark configuration |
| `--no-config` | Skip remark configuration discovery |
| `--ignore-path PATH` | Load an explicit ignore file |
| `--stdin-filepath PATH` | Name standard input for diagnostics and configuration lookup |

Both policy-group flags retain the recommended Markdown structure checks.
The group flags cannot be combined.

## Configuration precedence

The native engine reads `.remarkrc.*` and `remarkConfig` in `package.json`.
The package's standard plugin options remain the configuration contract.
CLI flags override shared config defaults, while per-rule settings override those shared values.

The CLI controls write mode independently.
Without `--fix`, a config containing `fix: true` still runs as a check.
Native lint comments suppress both findings and their edit eligibility.

## Verified fixes

Run a fix and review its diff:

```sh
npx remark-lint-slopstopper --fix docs/
git diff -- docs/
```

Verified prose edits can land while unfixable findings remain.
Remaining findings still fail the command.
A processing exception prevents writes for the affected file.
Diagrams and budget findings require manual changes.

The CLI writes the plugin's edited source without serialising unrelated Markdown.
See [automatic edit verification](../RULES.md#automatic-edit-verification).

## JSON output and exit codes

`--json` writes an object with a `files` array.
Each file includes its path, the count of verified edits and its remaining messages.
Each message contains a reason, source, rule identifier, severity and available source positions.
Invocation errors go to standard error.

| Code | Meaning |
| --- | --- |
| `0` | No remaining findings |
| `1` | Lint findings remain, including upstream warning findings |
| `2` | Invalid arguments, configuration, input or processing failure |

The [rule reference](../RULES.md) describes the checks behind each finding.
