# Run checks in CI

Run remark in check mode and fail the build on findings.
Install the package, `remark-cli` and your config before adding this step.

## Add a project command

Add a script to your project's `package.json`:

```json
{
  "scripts": {
    "lint:docs": "bunx --bun remark-cli --no-stdout --frail docs/"
  }
}
```

Run it locally before adding it to CI:

```sh
bun run lint:docs
```

`--no-stdout` keeps source text out of the log.
`--frail` makes upstream warning findings fail the command too.
Keep `fix` off in the config used by this check.

## Add a workflow step

After checking out the repository, install Bun and run your command:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: oven-sh/setup-bun@v2
    with:
      bun-version: "1.3.14"
  - run: bun install --frozen-lockfile
  - run: bun run lint:docs
```

Commit your Bun lockfile so the installation can run in frozen mode.
The command exits successfully when no enabled policy reports a finding.

## Use an explicit configuration

If CI runs from another directory, pass the config path:

```sh
bunx --bun remark-cli --rc-path examples/remark.config.mjs --no-stdout --frail docs/
```

Remember that vocabulary lookup uses `VFile.cwd`.
See [Teach project vocabulary](vocabulary.md) when CI and local runs recognise different terms.
