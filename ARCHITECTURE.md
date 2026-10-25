# Documentation lint architecture

This package separates its Markdown policies from shared document models, language analysis and Mermaid infrastructure.
The [remark adapter](src/remark/plugin.ts) owns configuration, native suppression and optional source edits.
All models and caches are transient process memory.
See [contributing](CONTRIBUTING.md) to add a policy.
The [root export](index.ts) is a separate upstream recommended remark preset; custom policies require `remark-lint-slopstopper/remark`.

## Package boundaries

Which components own parsing, policy and reporting?

```mermaid
---
config:
  themeVariables:
    edgeLabelBackground: '#f1f5f9'
---
flowchart LR
    Host[Remark host]:::ingress --> Doc[DocumentContext]:::data
    Doc --> Prose[Prose orchestration]:::compute
    Doc --> Mermaid[Mermaid orchestration]:::compute
    Prose --> PR[Prose rules]:::compute
    Mermaid --> MR[Mermaid rules]:::compute
    PR --> Findings[Diagnostics]:::data
    MR --> Findings
    Findings --> Host
    classDef ingress fill:#2563eb,stroke:#bfdbfe,color:#ffffff,stroke-width:2px
    classDef compute fill:#7c3aed,stroke:#ddd6fe,color:#ffffff,stroke-width:2px
    classDef data fill:#0f766e,stroke:#99f6e4,color:#ffffff,stroke-width:2px
```

The host supplies its actual mdast tree to [`createDocument`](src/document/context.ts).
String callers use the shared remark parser with GFM and frontmatter support.
The [prose orchestrator](src/prose/analyze.ts) and [Mermaid orchestrator](src/mermaid/analyze.ts) dispatch enabled rules without evaluating disabled policies.
The remark adapter loads the Mermaid subsystem only when a Mermaid policy runs.
Prose-only configurations do not initialise Mermaid or install its browser globals.

| Policy file | Responsibility |
| --- | --- |
| [`prose/rules/sentence-one-per-line.ts`](src/prose/rules/sentence-one-per-line.ts) | Detect sentence layout and expose verified whitespace edits |
| [`prose/rules/sentence-word-budget-exceeded.ts`](src/prose/rules/sentence-word-budget-exceeded.ts) | Enforce the word budget and suggest shorter sentences |
| [`prose/rules/paragraph-sentence-budget-exceeded.ts`](src/prose/rules/paragraph-sentence-budget-exceeded.ts) | Enforce the sentence budget and suggest lexical groups |
| [`prose/rules/list-semicolon-delimited-run.ts`](src/prose/rules/list-semicolon-delimited-run.ts) | Detect semicolon-delimited lists and promote them after a colon lead-in |
| [`prose/rules/list-interpunct-joined-run.ts`](src/prose/rules/list-interpunct-joined-run.ts) | Detect single-line Interpunct Runs and promote them |
| [`prose/rules/list-inline-enumeration-markers.ts`](src/prose/rules/list-inline-enumeration-markers.ts) | Detect inline enumeration markers and promote a clean sequence to a numbered list |
| [`prose/rules/list-comma-labelled-run.ts`](src/prose/rules/list-comma-labelled-run.ts) | Detect comma-joined labelled items and promote fully labelled sentences |
| [`prose/rules/list-comma-code-run.ts`](src/prose/rules/list-comma-code-run.ts) | Detect comma-joined code spans and promote a run that closes its sentence |
| [`prose/rules/list-comma-plain-run.ts`](src/prose/rules/list-comma-plain-run.ts) | Detect long plain-word series and promote them after a colon lead-in |
| [`prose/rules/list-stacked-interpunct-runs.ts`](src/prose/rules/list-stacked-interpunct-runs.ts) | Detect stacked Interpunct Runs and promote labelled lines to a nested list |
| [`prose/rules/punctuation-em-dash-in-prose.ts`](src/prose/rules/punctuation-em-dash-in-prose.ts) | Detect em-dashes and swap unambiguous ones for parentheses or a colon |
| [`prose/rules/punctuation-interpunct-in-prose.ts`](src/prose/rules/punctuation-interpunct-in-prose.ts) | Detect stray interpuncts outside claimed runs and swap spaced ones for commas |
| [`mermaid/contrast/policy.ts`](src/mermaid/contrast/policy.ts) | Audit rendered text surfaces in both themes |
| [`mermaid/complexity/policy.ts`](src/mermaid/complexity/policy.ts) | Calculate VCS and report verified split recommendations |

[`types.ts`](src/types.ts) defines common options, diagnostics and edits.
[`rules.ts`](src/rules.ts) lists the policy identifiers and the order automatic edits land in.
Mermaid parse failures are supporting diagnostics, not a separate configurable policy.

## Shared prose analysis

How do prose policies reuse language work without reparsing the host tree?

```mermaid
flowchart LR
    AST[Paragraph and Text nodes]:::ingress --> View[data.language view]:::data
    View --> Projection[Lazy source projection]:::compute
    View --> Promise[One lazy sentence Promise]:::compute
    Promise --> NLP[Compromise analysis]:::infra
    NLP --> Sentences[Sentence models]:::data
    Sentences --> Rules[Prose policies]:::compute
    Projection --> Rules
    classDef ingress fill:#2563eb,stroke:#bfdbfe,color:#ffffff,stroke-width:2px
    classDef compute fill:#7c3aed,stroke:#ddd6fe,color:#ffffff,stroke-width:2px
    classDef data fill:#0f766e,stroke:#99f6e4,color:#ffffff,stroke-width:2px
    classDef infra fill:#475569,stroke:#cbd5e1,color:#ffffff,stroke-width:2px
```

[`DocumentContext`](src/document/context.ts) indexes paragraphs and text nodes, then attaches one `data.language` view to each.
The view exposes projected text without starting NLP.
Its non-enumerable `sentences` getter dynamically loads Compromise and memoises one Promise per view.
[`LanguageView`](src/document/language-view.ts) supplies sentence boundaries, word counts, clause signals and lexical cohesion cues.
These cues guide edits; they do not guarantee semantic topic boundaries.
The [paragraph planner](src/prose/paragraph-plan.ts) owns policy-specific lexical grouping and budget-respecting break selection.
The document language model supplies sentences without depending on prose policy.

Projection maps decoded text back to original UTF-16 offsets, including escapes and entities.
Table paragraphs are excluded from running prose; blockquotes and explicit hard breaks remain lint-only for layout and promotion.
The punctuation policies also read headings and table cells.

Every edit is reparsed and compared with the original against the change its fixer declares.
[`edits.ts`](src/document/edits.ts) proves that a layout edit keeps the tree and a glyph swap keeps its shape and every visible word.
A List Promotion must replace only its paragraph, and each policy's edits are also verified as one batch.
[`source-text.ts`](src/document/source-text.ts) maps text nodes, separators and sentence spans back to source ranges.
It refuses any glyph that an entity or escape hides.

[`interpunct-runs.ts`](src/document/interpunct-runs.ts) derives each Interpunct Run once.
The list policies and the stray-glyph policy therefore agree about which glyphs a list claims.
The [List Promotion builder](src/prose/promotion.ts) slices item text from the source and declares the fragment the verifier must find.

## Mermaid analysis and split planning

The [Mermaid subsystem](src/mermaid/README.md) selects actual fences from the host tree and serialises analysis around mutable official parser and theme state.
Its two policies score visual complexity and rendered text contrast, including both viewer themes.
Parse failures become errors for the selected policy; disabled policies do not run.
Bounded caches reuse canonical parser results while diagnostics always reflect the current host tree.

The [split planner](src/mermaid/splitting/README.md) can recommend overview and detail diagrams after independent recoverability, emitted-source and information-loss checks.
Mermaid policies provide guidance without automatic edits.
Sequence diagrams are not split because graph extraction would discard message order.

## Event model: remark execution and fixes

When does lazy analysis run, and which findings may change source?

```mermaid
---
config:
  themeVariables:
    actorBorder: '#2563eb'
    actorLineColor: '#64748b'
    signalColor: '#64748b'
    noteBkgColor: '#7c3aed'
    noteTextColor: '#ffffff'
    noteBorderColor: '#ddd6fe'
---
sequenceDiagram
    participant H as Remark host
    participant A as Adapter
    participant D as DocumentContext
    participant R as Enabled rule
    participant C as Compromise
    participant S as Native suppression
    H->>A: Actual tree and source
    A->>D: createDocument with tree
    Note over D: Attach lazy node views
    loop Each enabled policy
        A->>R: Context and rule options
        opt Prose requests sentences
            R->>D: Read language sentences
            D->>C: Load and analyse on first read
            C-->>D: Memoised sentence models
            D-->>R: Shared sentence Promise
        end
        R-->>A: Diagnostics and optional edits
    end
    A->>S: Apply native lint comments
    S-->>A: Visible messages
    opt Fix enabled and visible edits remain
        A->>A: Apply one policy's verified edits
        A->>H: Reparse edited source
        H-->>A: Fresh tree
        Note over A,D: Repeat reporting until stable
    end
    A-->>H: Current tree and source
```

Suppression runs before the adapter selects fixes.
Each round applies the visible edits of one policy, the first in fix order that has any.
List promotions land before glyph swaps, and sentence layout lands last.

[`applyEdits`](src/document/edits.ts) rejects overlapping ranges and applies edits from the end of the source.
The adapter reparses after each changed round and reports again until stable.
Its compiler returns the edited source, preserving unrelated formatting instead of serialising the entire Markdown tree.

## Data model: transient relationships

Which objects are shared during one analysed document revision?

```mermaid
 erDiagram
    DocumentContext ||--|| Root : wraps
    Root ||--o{ Paragraph : indexes
    Root ||--o{ Text : indexes
    Paragraph |o--|| LanguageView : carries
    Text |o--|| LanguageView : carries
    LanguageView ||--o{ LanguageSentence : resolves
    DocumentContext ||..o{ Diagnostic : produces
    Diagnostic ||--o| TextEdit : offers
    classDef ingress fill:#2563eb33,stroke:#2563eb,stroke-width:2px
    classDef compute fill:#7c3aed33,stroke:#7c3aed,stroke-width:2px
    classDef data fill:#0f766e33,stroke:#0d9488,stroke-width:2px
    class Root,Paragraph,Text ingress
    class DocumentContext,LanguageView compute
    class LanguageSentence,Diagnostic,TextEdit data
```

`LanguageSentence` is the sentence model from [`document/language-view.ts`](src/document/language-view.ts).
Each view belongs to one paragraph or text node, and resolves zero or more sentences on demand.
Each diagnostic contains a rule identifier, message and absolute UTF-16 range; its optional edit contains a replacement range and text.
Diagnostics are returned results, not stored fields on `DocumentContext`.

Containment edges summarise descendants rather than immediate mdast parent relationships.
Each reporting round creates its own document context.
Node projections and language views live in context-local WeakMaps.
[`memoBySource`](src/mermaid/parsing/engine.ts) bounds official parser-result caches and returns cloned values.
The adapter recomputes diagnostics from the actual tree; it has no cross-document diagnostic cache.
No database or message broker participates in these relationships.

## Project vocabulary lifecycle

How does an optional concepts file influence language analysis?

```mermaid
---
config:
  themeVariables:
    actorBorder: '#2563eb'
    noteBkgColor: '#7c3aed'
    noteTextColor: '#ffffff'
    noteBorderColor: '#ddd6fe'
---
sequenceDiagram
    participant R as Prose policy
    participant L as LanguageView
    participant V as Context vocabulary
    participant F as Working directory
    participant N as Compromise document
    R->>L: Request sentences
    L->>V: Resolve shared lazy vocabulary
    V->>F: Read CONCEPTS.md
    F-->>V: Markdown or absent file
    V->>V: Parse defined headings
    V-->>L: Noun vocabulary snapshot
    L->>N: Parse prose and tag literal domain phrases
    N-->>L: Sentence models and lexical cues
    L-->>R: Memoised sentence Promise
    Note over V,N: No global dictionary mutation
```

[`concepts.ts`](src/document/concepts.ts) uses `VFile.cwd` through the adapter.
Direct `createDocument` callers can pass `cwd`, which defaults to the process working directory.
Only that directory's `CONCEPTS.md` is inspected; there is no ancestor search.
The first sentence request reads the file, and every view in that context shares its vocabulary snapshot.
Fresh contexts, including fixer rounds, read a fresh snapshot when requested.
Absent files yield an empty vocabulary; other file-access failures propagate.
Mermaid-only runs and unrequested language views do not read concepts or load NLP.

Definitions use a level-two or deeper heading followed immediately by a paragraph.
Inline formatting is removed, whitespace is normalised and matching is case-insensitive.
Titles, fenced examples, tables and definition prose do not become vocabulary.
List-only glossaries and implicit aliases are not extracted; document each alias as its own entry.

Terms become nouns in each Compromise sentence document through literal lookup and tagging.
The global dictionary stays unchanged because Compromise's lexicon constructor argument calls its global `addWords` internally.
Definitions enrich lexical guidance rather than teaching semantic meaning or adding a lint policy.
Word budgets still count visible whitespace-delimited words; a multiword term is not counted as one word.
