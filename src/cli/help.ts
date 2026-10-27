export const HELP = `Usage: remark-lint-slopstopper [options] <files, folders or globs...>

Check Markdown structure, prose readability and Mermaid diagrams.
No configuration or separate remark-cli installation is required.
With no file arguments, read Markdown from stdin.

Options:
  -h, --help                 Show this help
  -v, --version              Show the package version
  --fix                      Write verified prose edits in place
  --json                     Write machine-readable findings to stdout
  --max-words <n>             Shared sentence word budget (default: 25)
  --max-sentences <n>         Shared paragraph sentence budget (default: 5)
  --min-items <n>             Shared list-run threshold (minimum: 2)
  --preset <name>             low-density, medium-density or high-density
  --prose-only               Disable Mermaid policies
  --mermaid-only             Disable prose policies
  --disable-rule <name>       Disable a custom rule by short name; repeatable
  --list-rules               List all custom policy identifiers
  --config <path>            Load an explicit remark configuration
  --no-config                Skip remark configuration discovery
  --ignore-path <path>       Load an explicit ignore file
  --stdin-filepath <path>    Name stdin for config lookup and diagnostics

Defaults: recommended remark-lint rules plus every custom policy.
Reads .remarkrc.*, remarkConfig and .remarkignore using the remark engine.
Explicit ignored files report errors; directory discovery skips them.
CLI flags override shared config defaults; per-rule options take precedence.
Only --fix enables file writes, even if a config sets fix: true.
Mermaid and budget findings require manual changes.

Exit status: 0 = clean, 1 = findings, 2 = invocation or processing error.

Examples:
  bunx @jpeakai/remark-lint-slopstopper docs/
  bunx @jpeakai/remark-lint-slopstopper --fix "docs/**/*.md"
  bunx @jpeakai/remark-lint-slopstopper --prose-only --json README.md
`;
