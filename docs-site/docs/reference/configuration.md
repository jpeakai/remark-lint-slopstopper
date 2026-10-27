# Configuration reference

The custom plugin accepts `RemarkSlopstopperOptions`.
Use short rule names under `rules` and combine settings with the [configuration guide](../guides/configuration.md).

## Plugin options

| Key | Type | Default | Behaviour |
| --- | --- | --- | --- |
| `fix` | `boolean` | `false` | Apply verified prose edits to the VFile source |
| `options` | `RuleOptions` | `{}` | Supply defaults shared by enabled policies |
| `rules` | Partial map of short names to rule settings | All Custom Policies enabled | Configure or disable individual policies |

The root `@jpeakai/remark-lint-slopstopper` export is a preset object.
It does not accept these custom-plugin options.

## Rule settings

| Setting | Result |
| --- | --- |
| Omitted, `true`, `2` or `"error"` | Enable the policy with shared defaults |
| `false`, `0` or `"off"` | Disable the policy |
| An options object | Enable the policy with per-rule overrides |
| `[severity, options]` | Apply the severity and per-rule overrides |

Warning severity is not part of the supported type.
Each enabled Custom Policy emits a fatal VFile message with source `remark-lint` and its short rule name.

## Shared options

| Key | Used by | Default |
| --- | --- | --- |
| `maxWords` | Sentence word budget | `25` |
| `maxSentences` | Paragraph sentence budget | `5` |
| `minItems` | List run policies that expose a threshold | Rule-specific; see [Rules](../RULES.md#custom-policies) |
| `preset` | Mermaid visual complexity | `"high-density"` |
| `canvas` | Mermaid contrast | GitHub light and dark canvases |
| `complexity` | Mermaid visual complexity | Preset thresholds and default weights |

`minItems` is a whole number of at least two.
Per-rule settings override shared values.

## Complexity Presets

| Preset | Acceptable visual score | Target visual score |
| --- | --- | --- |
| `low-density` | `25` | `20` |
| `medium-density` | `40` | `30` |
| `high-density` | `60` | `40` |

The acceptable visual score triggers the finding.
Targets guide split recommendations.
The [rule reference](../RULES.md#mermaid-visual-complexity) defines the score formula.

## Native suppression

Use `<!--lint disable short-rule-name-->` and `<!--lint enable short-rule-name-->` around a passage.
Suppression controls both messages and automatic edit eligibility.
See [Configure policies](../guides/configuration.md#suppress-a-specific-passage) for a complete example.
