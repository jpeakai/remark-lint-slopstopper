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

After Codex finishes, the runner checks each selected comparison's diagram family.
A family change fails the run, naming the file, unless [translations.yml](../translations.yml) approves it as a Portable Translation and its facts survive.

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

Results go to `tmp/renders/comparison/`, with a `manifest.json` recording source hashes, scenarios, artifact paths, sizes and dimensions.
Use `--out DIR` for another location.

Comparisons must render.
Originals can fail on purpose, so `--originals` renders them into `tmp/renders/original/` and records their render errors instead of failing.

The verifier uses the site's pinned Mermaid and Playwright's Chromium.
Install that browser once with `bunx playwright install chromium`, or set `CHROME_PATH` to an installed Chrome or Chromium executable.
`bun run test:render` checks the verifier itself against real renders, and needs the same browser.
The documentation site's CI build runs both and uploads the renders as the `diagram-renders` artifact.
