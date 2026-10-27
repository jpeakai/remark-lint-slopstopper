# Troubleshoot findings

Start with the symptom, then recheck the affected file after making a change.

| Symptom | Check |
| --- | --- |
| Only Markdown formatting rules appear | Load `@jpeakai/remark-lint-slopstopper/remark` for the Custom Policies |
| More policies run than the config lists | Unspecified Custom Policies stay enabled; explicitly disable unwanted ones |
| A setting is ignored | Use the short name after the identifier's slash |
| `--output` leaves a finding unchanged | Set `fix: true`; some findings require manual changes |
| A suppressed passage changes | Check the short rule name and the placement of its native lint comment |
| A concept is unrecognised | Check `CONCEPTS.md` in `VFile.cwd` and its heading-plus-paragraph structure |
| Mermaid reports cannot-evaluate | Resolve syntax errors or unsupported styles before evaluating the diagram |
| A diagram stays unchanged in fix mode | Mermaid policies supply guidance without automatic edits |
| The CLI rejects TypeScript imports | Use `bunx --bun remark-cli` or the required Node.js version |

## Check errors separately from edits

A successful edit does not imply a passing file.
A sentence can move onto its own line and still exceed its word budget.
Read the remaining rule name and source position before trying another fix.

See [automatic edit verification](../RULES.md#automatic-edit-verification) for refusal conditions.

## Treat diagram recommendations as guidance

A Split Plan is offered only when its checks pass.
Some graphs are clearer as lists or matrices.
Sequence diagrams retain message order and are not split.

See [Mermaid findings](../examples/mermaid.md) and [split planning](../src/mermaid/splitting/README.md) for the supported boundaries.
