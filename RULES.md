# Lint rule reference

This reference covers the custom policies exported by `@jpeakai/remark-lint-slopstopper/remark` and the upstream rules enabled by the root `@jpeakai/remark-lint-slopstopper` preset.
The root preset does not automatically enable the custom policies.
See [configuration](README.md#enable-custom-policies), [contributing](CONTRIBUTING.md) and [architecture](ARCHITECTURE.md).

## Entry points and severity

| Entry point | Enabled checks | Automatic edits |
| --- | --- | --- |
| `@jpeakai/remark-lint-slopstopper` | GFM and upstream recommended remark-lint rules | None provided by this package |
| `@jpeakai/remark-lint-slopstopper/remark` | Custom prose and Mermaid policies | Verified prose edits when `fix: true` |

Every enabled custom policy reports a fatal VFile error.
Custom severity settings accept errors or disabling, not warnings.
The upstream preset retains upstream message severity; the repository CLI uses `--frail`, so its findings also fail the command.
Using both entry points combines their checks.
`fix: true` applies verified prose edits but does not guarantee the file passes remaining rules.

## Custom policies

The registry is [`src/rules.ts`](src/rules.ts); identifiers and shared options are defined in [`src/types.ts`](src/types.ts).
Configuration uses the short policy name after the slash.

| Full identifier | Detects | Options | Automatic edit |
| --- | --- | --- | --- |
| `prose/sentence-one-per-line` | Multiple sentences on one line or a soft wrap within a sentence | None specific | Verified whitespace edits |
| `prose/sentence-word-budget-exceeded` | A sentence exceeding its word budget | `maxWords`, default 25 | None |
| `prose/paragraph-sentence-budget-exceeded` | A paragraph exceeding its sentence budget | `maxSentences`, default 5 | None |
| `prose/list-semicolon-delimited-run` | Two or more semicolons in one sentence | `minItems`, default 3 | List Promotion after a colon lead-in |
| `prose/list-interpunct-joined-run` | Items joined by interpuncts on one line | `minItems`, default 3 | List Promotion after a colon or of a whole paragraph |
| `prose/list-inline-enumeration-markers` | Inline markers such as `(a)` and `(b)` | None specific | Numbered List Promotion of a clean sequence |
| `prose/list-comma-labelled-run` | Comma-joined segments that each open with a label | `minItems`, default 3 | List Promotion when every segment is labelled |
| `prose/list-comma-code-run` | Comma-joined inline code spans | `minItems`, default 3 | List Promotion when the run closes its sentence |
| `prose/list-comma-plain-run` | A long comma-joined series of short words closing a sentence | `minItems`, default 5 | List Promotion after a colon lead-in |
| `prose/list-stacked-interpunct-runs` | Interpunct runs stacked on several lines | None specific | Nested List Promotion when every line has a label |
| `prose/punctuation-em-dash-in-prose` | An em-dash in prose | None specific | Parentheses for a pair, a colon for a lone dash |
| `prose/punctuation-interpunct-in-prose` | A stray interpunct outside a claimed run | None specific | A comma for each spaced interpunct |
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

### List promotion

The list policies find a list hidden in running prose.
Their automatic edit is a List Promotion: a lead-in line followed by a real Markdown list.
Item text is sliced from the source, so links, emphasis and code travel unchanged.

Inside a list item the promoted list nests under the lead-in.
Tables, blockquotes, hard breaks and an item that would open as another block stay lint-only.
Each run policy takes a `minItems` option, a whole number of at least 2, read the same way by its check and its edit.

### Semicolon-delimited run

[`list-semicolon-delimited-run.ts`](src/prose/rules/list-semicolon-delimited-run.ts) reports a sentence with two or more semicolons.
A single joining semicolon is allowed.
With a colon lead-in, this sentence becomes a bullet list:

```text
A release needs: a signed tag; a changelog entry; and a green build.
```

```text
A release needs:

- a signed tag
- a changelog entry
- a green build
```

Without a colon there is no lead-in to keep, so this stays reported for a manual rewrite:

```text
A release needs a signed tag; a changelog entry; a green build.
```

### Interpunct-joined run

[`list-interpunct-joined-run.ts`](src/prose/rules/list-interpunct-joined-run.ts) reports items joined by interpuncts on one source line.
It reports three items or more by default:

```text
Stack: Bun · TypeScript · biome.
```

With `fix: true` the items follow the label:

```text
Stack:

- Bun
- TypeScript
- biome
```

Without a colon the run must be the whole paragraph.
A shorter run is no list, so the stray-interpunct policy reports its glyphs instead.
A separator inside a link or emphasis leaves the run lint-only.

### Inline enumeration markers

[`list-inline-enumeration-markers.ts`](src/prose/rules/list-inline-enumeration-markers.ts) reports the first two markers of one family inlined in a paragraph.
The families are letters, numbers and roman numerals in parentheses:

```text
The engine (a) parses the file, (b) runs each fixer and (c) verifies the result.
```

A clean sequence becomes a numbered list:

```text
The engine:

1. parses the file
2. runs each fixer
3. verifies the result
```

A gap, a mixed family or markers split across sentences stay reported.
Two markers joined only by a conjunction read as cross-references, so this stays reported:

```text
See (a) above and (b) below.
```

### Comma-joined labelled run

[`list-comma-labelled-run.ts`](src/prose/rules/list-comma-labelled-run.ts) reports three or more comma-joined segments that each open with a label.
A label is inline code or an identifier with a digit such as `MD025`, and content must follow it:

```text
Targets: `fix` regenerates the bundle, `ci` asserts a clean tree, and `docs-ci` gates the prose.
```

The edit keeps each label:

```text
Targets:

- `fix` regenerates the bundle
- `ci` asserts a clean tree
- `docs-ci` gates the prose
```

Bare labels with no content form a subject, not a list.
The edit applies only when every segment of the sentence is labelled.

### Comma-joined code run

[`list-comma-code-run.ts`](src/prose/rules/list-comma-code-run.ts) reports three or more inline code spans joined by commas.
An "and" or "or" may precede the last span, and the check counts a run anywhere in a sentence:

```text
The release touches `config.yaml`, `schema.json`, `Makefile` and `README.md`.
```

The edit needs the run to close its sentence after a lead-in:

```text
The release touches:

- `config.yaml`
- `schema.json`
- `Makefile`
- `README.md`
```

A run in the middle of a sentence, or one opening inside a link or emphasis, stays reported.

### Comma-joined plain run

[`list-comma-plain-run.ts`](src/prose/rules/list-comma-plain-run.ts) reports a long run of short plain-word items that closes a sentence.
An item is one to three plain words without a verb inside it.
A code span, a number, a link or a clause therefore ends the run.
The run needs a colon before it, or a conjunction before its last item.
The default is five items, because a short series reads as ordinary English.

```text
Tags: alpha, beta, rc, next, canary.
```

The edit needs the colon lead-in:

```text
Tags:

- alpha
- beta
- rc
- next
- canary
```

Without a colon there is no telling where the first item starts, so this stays reported:

```text
It publishes alpha, beta, rc, next, nightly and canary.
```

### Stacked interpunct runs

[`list-stacked-interpunct-runs.ts`](src/prose/rules/list-stacked-interpunct-runs.ts) reports interpunct runs stacked on two or more lines of one paragraph:

```text
Runtime: Bun · Node
Tooling: biome · tsc
```

When every line opens with a label, the edit builds one parent item per label:

```text
- Runtime
  - Bun
  - Node
- Tooling
  - biome
  - tsc
```

A line without a label has no parent item, so the paragraph stays reported.
Sentence layout never joins the lines of a stacked run.

### Em-dash in prose

[`punctuation-em-dash-in-prose.ts`](src/prose/rules/punctuation-em-dash-in-prose.ts) reports an em-dash in any prose text, including headings and table cells.
A pair of dashes around an aside becomes parentheses:

```text
The engine — not the fixer — decides what is kept.
```

```text
The engine (not the fixer) decides what is kept.
```

A lone dash becomes a colon:

```text
One rule matters — never guess.
```

```text
One rule matters: never guess.
```

Each aside of a sentence is its own finding.
A numeric range wants an en-dash instead, so this stays reported:

```text
Pages 10 — 12 cover it.
```

A sentence that already holds a colon stays reported, as do three dashes in one sentence.
So do an aside that reads as a marker and a dash beside markup.

### Interpunct in prose

[`punctuation-interpunct-in-prose.ts`](src/prose/rules/punctuation-interpunct-in-prose.ts) reports a stray interpunct outside a run that a list policy claims.
It reads headings and table cells too.
A spaced interpunct becomes a comma:

```text
Written in TypeScript · run on Bun.
```

```text
Written in TypeScript, run on Bun.
```

A glyph with no space beside it, as in a product name, stays reported for a manual decision.

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

The default weights are:

- `edgeWeight: 0.5`
- `rowWeight: 0.25`
- `subgraphWeight: 3`
- `depthWeight: 0.1`

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
The punctuation policies also read headings and table cells, because a stray glyph is wrong wherever it sits.
Lazy language views remain available to other rules on paragraph and text nodes, including nodes excluded from running prose.
Heading-defined terms from optional `CONCEPTS.md` enrich each document's NLP vocabulary without creating a vocabulary-enforcement rule.

Mermaid rules inspect actual Mermaid code nodes in the current host tree.
Multiple fences are evaluated independently, with source ranges mapped back to the Markdown file.
The analysis queue protects mutable official parser and theme state.

Native comments such as `<!--lint disable sentence-one-per-line-->` suppress matching diagnostics and their edit eligibility.
Suppression happens before fix selection.
Each round applies the visible edits of one policy, in a fixed order: list promotions, then glyph swaps, then sentence layout.
A promotion needs the separators a glyph swap would erase, and layout settles the blocks last.
The adapter reparses after each round and reports again until stable.

## Automatic edit verification

Every edit is reparsed and compared with the original before a finding may carry it.
Each fixer declares the exact change it expects, and any other difference withdraws the edit:

| Declared change | What the comparison proves |
| --- | --- |
| Layout | The tree is unchanged once text whitespace collapses |
| Glyph swap | The tree keeps its shape and every visible word |
| List Promotion | One paragraph becomes the declared lead-in and list, and nothing else moves |

Visible words are text, code, alt text and URLs, without joining conjunctions or enumeration markers.
A glyph swap or promotion that loses a word is a fixer defect, so it raises an error instead of being withdrawn.
A fixer offers no edit when its input is ambiguous, and the finding stays for a human.
One policy's edits are also verified together; when only the batch fails, the first edit lands and the next round reports the rest.

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
