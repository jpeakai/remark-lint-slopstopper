# Configure policies

Set policies in `.remarkrc.mjs` at your project root.
You need the package and `remark-cli` installed in that project.

## Combine Markdown and readability checks

Load the root preset for Markdown structure and the custom plugin for prose and Mermaid checks:

```js
import recommended from "@jpeakai/remark-lint-slopstopper";
import slopstopper from "@jpeakai/remark-lint-slopstopper/remark";

export default {
  plugins: [recommended, [slopstopper, {
    options: { maxWords: 25, maxSentences: 5 },
    rules: {
      "sentence-word-budget-exceeded": { maxWords: 20 },
      "list-comma-plain-run": { minItems: 4 },
      "complexity-visual-score-acceptable-exceeded": {
        preset: "low-density"
      }
    }
  }]]
};
```

The custom plugin enables every Custom Policy unless you disable it.
The root preset alone enables no Custom Policies.

## Override a shared budget

The `options` object supplies shared defaults.
A rule's options override those defaults.
In the example, sentences have a 20-word budget and paragraphs have a five-sentence budget.

Use short rule names under `rules`.
The full identifier `prose/sentence-one-per-line` becomes `sentence-one-per-line` in the config.

## Disable an unwanted policy

Use `false`, `0` or `"off"`:

```js
rules: {
  "sentence-one-per-line": false,
  "contrast-text-below-aa": "off"
}
```

Enabled policies report errors.
Warning severity is not supported.

## Suppress a specific passage

Native remark-lint comments suppress the finding and its edit eligibility:

```markdown
<!--lint disable sentence-one-per-line-->

Keep these sentences together. This passage has a deliberate layout.

<!--lint enable sentence-one-per-line-->
```

Use the same short name as the config.
Suppression runs before the adapter selects edits.

## Match a diagram's host canvas

If your host uses different opaque page colours, configure both canvases:

```js
rules: {
  "contrast-text-below-aa": {
    canvas: { light: "#ffffff", dark: "#101114" }
  }
}
```

The defaults follow GitHub's canvas colours.

## Match Material for MkDocs

Material for MkDocs repaints Mermaid with its palette, so give the `mkdocs-material` viewer the colours it measures in each palette:

```js
options: {
  viewer: "mkdocs-material",
  host: {
    light: {
      canvas: "#ffffff", text: "#36464e", edge: "#36464e",
      nodeFill: "#526cfe1a", accent: "#526cfe",
      clusterFill: "#00000012", accentText: "#ffffff"
    },
    dark: {
      canvas: "#1e2129", text: "#d5d8e2", edge: "#d5d8e2",
      nodeFill: "#526cfe1a", accent: "#526cfe",
      clusterFill: "#e3e5ec1f", accentText: "#ffffff"
    }
  }
}
```

These values approximate Material's default indigo palette.
Replace them with your site's measured values; see [Mermaid viewer profiles](../RULES.md#mermaid-viewer-profiles) for each anchor.
See the [configuration reference](../reference/configuration.md) for types and the [rules](../RULES.md) for policy-specific limits.
