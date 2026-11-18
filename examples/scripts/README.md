# Run diagram repairs and verify renders

The runner resets the selected `diagram-fixed.md` files, then starts one Codex process with the [repair prompt](../fix-prompt.md).
It requires Node 24 or newer, Bun and the Codex CLI.

Use the `mermaidjs-diagrams` folder from your installed **jpai-essentials** plugin from **jpeakai/skills**.
Pass its local path with `--skill` so the runner stages the skill and its resources:

```sh
bun run fix:examples --skill /path/to/jpai-essentials/skills/mermaidjs-diagrams
```

Repair one folder without resetting the others:

```sh
bun run fix:examples 03-flowchart--unreadable-label--text-against-node-fills \
  --skill /path/to/jpai-essentials/skills/mermaidjs-diagrams
```

Replace the placeholder with your installed skill directory, which must contain `SKILL.md`.
Without `--skill`, the prompt asks Codex to use the installed plugin skill.
Repeat `--skill` to stage additional local guidance.
Arguments after `--` are forwarded literally to `codex exec`.

Each run creates an isolated Codex home under `tmp/codex-runs/`.
Personal configuration is not copied, but repository and system guidance remains discoverable.

The runner copies the saved login with owner-only permissions unless `CODEX_API_KEY` is set.
Use `--auth-file PATH` for another saved login or `--codex-home PATH` for a new, unused run directory.
Authentication is checked before diagrams are reset.
Retained run directories can contain credentials; remove them when no longer needed.

Before resetting anything, the runner checks that visual verification can run.
It resolves a browser, launches it and renders a test diagram through the site renderer:

- `--browser PATH`, or else `CHROME_PATH`, names the browser explicitly; a missing or non-executable path is an error, never replaced by another browser
- without either, Playwright's Chromium must be installed; run `bunx playwright install chromium` once

If the browser or the renderer fails, no fixed diagram is reset and no run directory is created.
Codex then receives the verified browser as `CHROME_PATH` and a `tmp/` folder inside its run directory as `TMPDIR`.

After Codex finishes, the runner runs four post-checks, each to completion, so one failure never hides another:

- **family:** each comparison keeps its family, unless [translations.yml](../translations.yml) approves a Portable Translation whose facts survive
- **lint:** strict lint, as `bun run validate:examples` runs it, reports zero Diagnostics
- **renders:** the selected comparisons render into `renders/` inside the run directory, as described below
- **scope:** every unselected example's `diagram-fixed.md` is unchanged

A missing, empty or invalid artifact fails the renders check, and the manifest stays there as evidence.
`--render matched` checks each theme on its own page colour only; the default `--render full` keeps the whole matrix.
The run writes `report.json` to its run directory with the selected examples, Codex's exit status, each check's result and every strict Diagnostic.
If Codex fails, the run keeps Codex's exit status even when a post-check also fails.

Run `make site` after repairs, or `make site-serve` to review them in the local site.

## Verify renders

A renderer can exit successfully and still write an empty or truncated image.
The render verifier draws every Mermaid fence in each Viewer Scenario and checks each file it writes:

- light and dark themes
- white, black and transparent backgrounds
- PNG and SVG formats

```sh
bun run render:examples
```

Pass one or more folder names to render only those examples.
The expected artifact count comes from the parsed Mermaid fences, so a missing artifact fails the run.
Each failure names its scenario as `example#fence/theme/background/format`.

Each run writes to a new `tmp/renders/<time>/comparison/` folder, with a `manifest.json` recording source hashes, scenarios, artifact paths, sizes and dimensions.
Use `--out DIR` for another new folder inside `tmp/`.

The scripts check their paths before they reset a comparison or launch a browser:

- a selected example must be a real folder inside `examples/`, and its diagram files real files inside it
- output goes to a new folder inside the project's `tmp/`, reached without filesystem links
- every artifact, manifest and Acceptance Record is created exclusively, so an existing path cannot redirect or overwrite evidence

A Codex home given with `--codex-home` must therefore also be inside `tmp/`.

Pass `--matched` for the fast matched-background matrix.
Comparisons must render.
Originals can fail on purpose, so `--originals` renders them into `tmp/renders/original/` and records their render errors instead of failing.

The verifier uses the site's pinned Mermaid and Playwright's Chromium.
Install that browser once with `bunx playwright install chromium`, or set `CHROME_PATH` to an installed Chrome or Chromium executable.
`bun run test:render` checks the verifier itself against real renders, and needs the same browser.
The documentation site's CI build runs both and uploads the renders as the `diagram-renders` artifact.

## Validate current outputs

Strict Validation checks the repaired outputs as they stand, with no Finding Budget:

```sh
bun run validate:examples
```

Each selected example must keep its family and facts.
Each `diagram-fixed.md`, and all of them as one combined document, must report zero Diagnostics through the package's remark adapter with every policy at its default.
A lint control comment such as `<!-- lint disable -->` fails it, since it could silence a policy.
`bun run check` runs this gate over every example.
Pass folder names to validate only those, `--render` to also render the full matrix, and `--report FILE` for a JSON report inside `tmp/`.

## Accept comparisons

An aggregate pass can hide one comparison's regression, so each comparison is accepted on its own evidence:

```sh
make site
bun run accept:examples
```

For each selected example, the Acceptance Record in a new `tmp/acceptance/<time>/` folder records five checks:

- **family:** it keeps its family, or makes an approved Portable Translation that keeps its facts
- **facts:** a same-family comparison keeps every label, relationship, message order and number of its original
- **findings:** every package policy passes, except diagram findings within its Finding Budget
- **renders:** every artifact in the full matrix renders and validates
- **site:** the built site has its page, and both downloads match their sources

The record also lists the budgeted limitations it still shows and any translation it keeps.
Its `strict` field is true only when the comparison reports no Diagnostics at all.
A comparison accepted within its Finding Budget is reported as not strict; budgeted findings are never strict lint success.

The run also checks that a combined document of the selected comparisons reports exactly what each reports alone.
Pass folder names to accept only those examples, and `--site DIR` for a site built elsewhere.
The documentation site's CI build runs acceptance and uploads the records with the renders.

