# Lint rule reference

This reference covers the custom policies exported by `remark-lint-stopslop/remark` and the upstream rules enabled by the root `remark-lint-stopslop` preset.
The root preset does not automatically enable the custom policies.
See [configuration](README.md#enable-custom-policies), [contributing](CONTRIBUTING.md) and [architecture](ARCHITECTURE.md).

## Entry points and severity

| Entry point | Enabled checks | Automatic edits |
| --- | --- | --- |
| `remark-lint-stopslop` | GFM and upstream recommended remark-lint rules | None provided by this package |
| `remark-lint-stopslop/remark` | Custom prose and Mermaid policies | Sentence layout when `fix: true` |

Every enabled custom policy reports a fatal VFile error.
Custom severity settings accept errors or disabling, not warnings.
The upstream preset retains upstream message severity; the repository CLI uses `--frail`, so its findings also fail the command.
Using both entry points combines their checks.
`fix: true` applies sentence edits but does not guarantee the file passes remaining rules.

## Custom policies

The registry is [`src/rules.ts`](src/rules.ts); identifiers and shared options are defined in [`src/types.ts`](src/types.ts).
Configuration uses the short policy name after the slash.

| Full identifier | Detects | Options | Automatic edit |
| --- | --- | --- | --- |
| `prose/sentence-one-per-line` | Multiple sentences on one line or a soft wrap within a sentence | None specific | Verified whitespace edits |
| `prose/sentence-word-budget-exceeded` | A sentence exceeding its word budget | `maxWords`, default 25 | None |
| `prose/paragraph-sentence-budget-exceeded` | A paragraph exceeding its sentence budget | `maxSentences`, default 5 | None |
| `mermaid/contrast-text-below-aa` | Rendered text below 4.5:1 or styling that cannot be audited | `canvas: {light, dark}` | None |
| `mermaid/complexity-visual-score-acceptable-exceeded` | Visual complexity exceeding the acceptable score | `preset`, `complexity` overrides | None |

### Sentence layout

[`sentence-one-per-line.ts`](src/prose/rules/sentence-one-per-line.ts) finds sentences sharing a line:

```text
The parser reads the file. The parser returns nodes.
```

With `fix: true`, safe whitespace becomes:

```text
The parser reads the file.
The parser returns nodes.
```

The rule also joins a soft wrap within one sentence.
Fixes preserve visible words, Markdown structure, surrounding bytes, indentation and line endings.
Blockquotes, explicit hard breaks and ambiguous structural edits remain lint-only.
Encoded spaces at sentence boundaries can require manual correction.

### Sentence word budget

[`sentence-word-budget-exceeded.ts`](src/prose/rules/sentence-word-budget-exceeded.ts) reports the count and suggests shorter sentences.
For an example configured with `maxWords: 8`, this sentence exceeds the budget:

```text
The parser reads the document and validates every recorded relationship.
```

A manual revision keeps each assertion short:

```text
The parser reads the document.
It validates every recorded relationship.
```

The rule does not rewrite or remove words.
Compromise and clause markers supply guidance, not semantic guarantees.
The budget counts whitespace-delimited projected words; a multiword domain concept still contains multiple words.

### Paragraph sentence budget

[`paragraph-sentence-budget-exceeded.ts`](src/prose/rules/paragraph-sentence-budget-exceeded.ts) suggests paragraph breaks using lexical-cohesion cues.
With `maxSentences: 2`, this paragraph exceeds the budget even though each sentence occupies its own line:

```text
The parser reads the document.
The parser produces nodes.
The worker stores results.
```

A manual revision separates the topics:

```text
The parser reads the document.
The parser produces nodes.

The worker stores results.
```

The rule reports sentence counts and suggested breaks without moving text automatically.

### Mermaid text contrast

[`contrast/policy.ts`](src/mermaid/contrast/policy.ts) checks actual text surfaces in light and dark themes.
The diagram-source examples use `text` fences so intentionally failing source is not treated as a live diagram.
When checking a real document, place the source inside a `mermaid` fence.

White text on a white node fails:

```text
flowchart LR
  A[Queue]:::queue
  classDef queue fill:#ffffff,color:#ffffff,stroke:#334155
```

A manual colour correction makes the text readable:

```text
flowchart LR
  A[Queue]:::queue
  classDef queue fill:#ffffff,color:#1e293b,stroke:#334155
```

The rule resolves supported styles, theme colours and translucent backgrounds using Color.js.
The default page canvas follows GitHub; pass the host's opaque `canvas.light` and `canvas.dark` values when different.
Unsupported CSS or unmodelled surfaces produce unauditable errors instead of passing silently.
Sequence diagrams are checked through their theme and ordered surface model.

### Mermaid visual complexity

[`complexity/policy.ts`](src/mermaid/complexity/policy.ts) reports the measured score and offers verified split guidance where possible.
For `preset: "low-density"`, this fan-out exceeds the acceptable score of 25:

```text
flowchart LR
  Root --> A & B & C & D & E & F & G & H & I & J & K & L & M & N & O & P & Q & R
```

The graph has 19 nodes and 18 edges, giving a score of 28 with the default weights.
A list or sentence can retain this simple relationship more clearly:

```text
Root routes to A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q and R.
```

For diagrams with meaningful internal boundaries, guidance can instead contain an overview and detail sources.
Plans must pass independent recoverability, source round-trip and declared-loss checks.
The rule never applies diagram changes automatically.
Sequence diagrams are not split because a graph projection would lose message order.

The score is:

```text
(nodes + edges × edgeWeight + rows × rowWeight + subgraphs × subgraphWeight)
  × (1 + maximumDepth × depthWeight)
```

Defaults are `edgeWeight: 0.5`, `rowWeight: 0.25`, `subgraphWeight: 3` and `depthWeight: 0.1`.
The default preset is `high-density`; available preset definitions and accepted overrides live in [`metrics.ts`](src/mermaid/complexity/metrics.ts).
The policy's error trigger is the acceptable visual score; node targets guide recommendations rather than defining another independently configurable rule.

### Supporting Mermaid parse failure

`mermaid/parse-diagram-unparseable` describes a supporting diagnostic, not a separate configurable policy.
An unterminated node label cannot be evaluated:

```text
flowchart LR
  A[Queue
```

Correct the syntax before checking contrast or complexity:

```text
flowchart LR
  A[Queue]
```

The remark adapter attributes a parse failure to the selected Mermaid policy as a cannot-evaluate error.
Disabling both Mermaid policies skips their parse checks.

## Shared custom-policy behaviour

Prose rules inspect running paragraphs and skip table cells, code blocks, frontmatter and HTML blocks.
Lazy language views remain available to other rules on paragraph and text nodes, including nodes excluded from running prose.
Heading-defined terms from optional `CONCEPTS.md` enrich each document's NLP vocabulary without creating a vocabulary-enforcement rule.

Mermaid rules inspect actual Mermaid code nodes in the current host tree.
Multiple fences are evaluated independently, with source ranges mapped back to the Markdown file.
The analysis queue protects mutable official parser and theme state.

Native comments such as `<!--lint disable sentence-one-per-line-->` suppress matching diagnostics and their edit eligibility.
Suppression happens before fix selection.
Only sentence-layout diagnostics expose accepted automatic edits; the adapter reparses after changes until stable.

## Upstream recommended rules

These rules come from `remark-preset-lint-recommended`, loaded by [`index.ts`](index.ts).
They check Markdown structure and style rather than prose budgets or diagram semantics.
Examples use `⏎` for a newline and `·` for a space; those visible symbols are notation, not literal Markdown.

| Rule | Finds and resolves | Failing source | Corrected source |
| --- | --- | --- | --- |
| `final-newline` | Missing final newline | `Queue.` | `Queue.⏎` |
| `hard-break-spaces` | Excess trailing spaces in a hard break | `Queue.···⏎Worker.⏎` | `Queue.··⏎Worker.⏎` |
| `list-item-bullet-indent` | Unnecessary indentation before a list item | `·- Queue⏎` | `- Queue⏎` |
| `list-item-indent` | Excess spacing after a list marker; preset uses `one` | `-···Queue⏎` | `- Queue⏎` |
| `no-blockquote-without-marker` | Lazy quote continuation without its marker | `> Queue.⏎Worker.⏎` | `> Queue.⏎> Worker.⏎` |
| `no-duplicate-definitions` | Repeated reference definitions | `[Queue][queue]⏎⏎[queue]: /one⏎[queue]: /two⏎` | `[Queue][queue]⏎⏎[queue]: /one⏎` |
| `no-heading-content-indent` | Excess spacing before heading content | `#··Queue⏎` | `# Queue⏎` |
| `no-literal-urls` | Bare URLs | `https://example.test/queue⏎` | `<https://example.test/queue>⏎` |
| `no-shortcut-reference-image` | Image references omitting the explicit label pair | `![queue]⏎⏎[queue]: /queue.svg⏎` | `![queue][queue]⏎⏎[queue]: /queue.svg⏎` |
| `no-shortcut-reference-link` | Link references omitting the explicit label pair | `[queue]⏎⏎[queue]: /queue⏎` | `[queue][queue]⏎⏎[queue]: /queue⏎` |
| `no-undefined-references` | References without a definition | `[Queue][missing]⏎` | `[Queue](/queue)⏎` |
| `no-unused-definitions` | Definitions used by no reference | `Queue.⏎⏎[unused]: /queue⏎` | `Queue.⏎` |
| `ordered-list-marker-style` | Ordered markers differing from the preset's period style | `1) Queue⏎` | `1. Queue⏎` |

Upstream plugin package names prefix these identifiers with `remark-lint-`.
The preset also loads the `remark-lint` control plugin; it is not another content rule.
GFM parsing support is likewise not a lint rule.
No upstream automatic fixes are exposed by this package.

## Checks still requiring review

There is no general provenance, factual accuracy, canonical-concept naming or architecture-scope policy in the custom registry.
Passing these rules does not prove that an architectural claim matches implementation or that a document has no change-history smell.
Use a separate editorial review for factual accuracy, terminology and architecture scope.
