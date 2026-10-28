# Check your first Markdown file

Run the standalone CLI, then apply a verified sentence-layout edit.
You need Node.js or Bun, and a project to lint.

## 1. Install the CLI

From your project root, run:

```sh
npm install --save-dev @jpeakai/remark-lint-slopstopper
npx remark-lint-slopstopper --help
```

The CLI supplies its remark engine and default policies.
You do not need a remark config or a separate CLI package.

## 2. Check a sample file

Create `sample.md`:

```markdown
The parser reads the file. The reporter prints a finding.
```

Run:

```sh
npx remark-lint-slopstopper --no-config sample.md
```

The command exits with code `1` and reports `sentence-one-per-line`.
The finding includes the file position and rule name.
`--no-config` keeps the example independent of any existing remark config.

## 3. Apply the verified fix

Run:

```sh
npx remark-lint-slopstopper --no-config --fix sample.md
npx remark-lint-slopstopper --no-config sample.md
```

The second command exits with code `0`.
The file now contains:

```markdown
The parser reads the file.
The reporter prints a finding.
```

The source line changes while the rendered paragraph stays together.

## Run without installing

The scoped name runs the same CLI without adding it to a project:

```sh
bunx @jpeakai/remark-lint-slopstopper --help
bunx @jpeakai/remark-lint-slopstopper --fix docs/
```

The plugin remains available as `@jpeakai/remark-lint-slopstopper/remark` for an existing remark pipeline.

## Where next?

- [CLI reference](docs/cli.md) covers flags, configuration precedence and exit codes.
- [Configure policies](guides/configuration.md) shows the plugin's native remark configuration.
- [Prose examples](examples/prose.md) shows which edits can be applied automatically.
