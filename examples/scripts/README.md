# Run diagram repairs

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

Run `make site` after repairs, or `make site-serve` to review them in the local site.
