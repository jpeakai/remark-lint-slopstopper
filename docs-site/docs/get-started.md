# Check your first Markdown file

Run the standalone CLI, then apply a verified sentence-layout edit.
You need Bun 1.3 or newer and a local checkout of this package.

## 1. Build the CLI

From the checkout root, run:

```sh
bun install
bun run build
node dist/cli.js --help
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
node dist/cli.js --no-config sample.md
```

The command exits with code `1` and reports `sentence-one-per-line`.
The finding includes the file position and rule name.
`--no-config` keeps the example independent of any existing remark config.

## 3. Apply the verified fix

Run:

```sh
node dist/cli.js --no-config --fix sample.md
node dist/cli.js --no-config sample.md
```

The second command exits with code `0`.
The file now contains:

```markdown
The parser reads the file.
The reporter prints a finding.
```

The source line changes while the rendered paragraph stays together.

## Use the packaged command

The scoped package is not yet published to npm.
After publication, you can run the same CLI without a checkout:

```sh
bunx @jpeakai/remark-lint-slopstopper --help
bunx @jpeakai/remark-lint-slopstopper --fix docs/
```

The plugin remains available as `@jpeakai/remark-lint-slopstopper/remark` for an existing remark pipeline.

## Where next?

- [CLI reference](docs/cli.md) covers flags, configuration precedence and exit codes.
- [Configure policies](guides/configuration.md) shows the plugin's native remark configuration.
- [Prose examples](examples/prose.md) shows which edits can be applied automatically.
