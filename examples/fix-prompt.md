# Repair the diagram examples

Use **jpai-essentials:mermaidjs-diagrams**, the `mermaidjs-diagrams` skill in the **jpai-essentials** plugin from **jpeakai/skills**.
Read its `SKILL.md`, `resources/color_theming.md` and only the references relevant to the assigned diagram family.
When a local skill path is supplied, read that copy and its resources.

Assign each subagent one numbered folder under `examples/` and exclusive write ownership of its `diagram-fixed.md`.
Keep scratch output under `tmp/{example-folder}/`.
Treat `diagram.md` as immutable diagram facts.
The runner resets the selected fixed files from their originals before starting.

Preserve labels, relationships, ordering and numeric values.
Split dense diagrams only when every fact remains recoverable from the resulting views.
For a portable translation, preserve the original diagram's meaning and explain the changed representation in the comparison file.

Apply the skill's palette guidance and verify both light and dark viewers.
Run the skill's complete lint gate after each repair batch:

```sh
bunx @jpeakai/mermaidjs-lint "examples/$example/diagram-fixed.md"
```

Also run this package's analysis to identify compatibility or policy differences:

```sh
bun run build
bun dist/cli.js --mermaid-only "examples/$example/diagram-fixed.md"
```

Do not weaken rules, discard facts or alter the originals to obtain a pass.
Report the exact command and any unresolved finding when the two engines differ.
After all repairs, verify the selected fixed files together and run `make site` to refresh the comparison pages.
