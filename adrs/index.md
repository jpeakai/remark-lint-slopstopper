<!-- GENERATED from the bundle's *.yml by okf_render.py. Do not edit; regenerate. -->

# Decision Records

| Record | Decision | Status |
|---|---|---|
| [SLOP-0001](0001-vendor-the-generator-into-the-bundle.md) | The bundle carries its own copy of the okf-yaml generator, schema and templates | accepted |
| [SLOP-0002](0002-host-tree-is-the-document.md) | Every policy reads the mdast tree the remark host already parsed | accepted |
| [SLOP-0003](0003-shared-document-context-per-round.md) | Whole-document data is derived once per round on a shared DocumentContext | accepted |
| [SLOP-0004](0004-lazy-language-view-on-nodes.md) | Paragraph and text nodes carry a language view that analyses on first read | accepted |
| [SLOP-0005](0005-concepts-file-is-project-vocabulary.md) | A project's CONCEPTS.md supplies the term names the language view tags as nouns | accepted |
| [SLOP-0006](0006-configuration-is-remark-plugin-options.md) | Configuration is remark plugin options, and a disabled policy never runs | accepted |
| [SLOP-0007](0007-a-finding-fails-or-the-policy-is-off.md) | A custom policy's finding is a fatal error, or the policy is off | accepted |
| [SLOP-0008](0008-rule-id-is-subsystem-category-and-short-name.md) | A policy identifier is its subsystem, then a category word and a short name | accepted |
| [SLOP-0009](0009-one-module-per-rule.md) | Each policy lives in its own module named by its short name | accepted |
| [SLOP-0010](0010-shared-code-groups-by-the-data-it-takes.md) | Shared code sits in the layer whose data it takes, and layers import downwards | accepted |
| [SLOP-0011](0011-code-complexity-is-gated-by-biome.md) | Code complexity is gated by Biome rules that fail the build | accepted |
| [SLOP-0012](0012-edits-splice-source-never-stringify.md) | Fixes splice source ranges and the adapter never stringifies the tree | accepted |
| [SLOP-0013](0013-a-fixer-refuses-when-unsure.md) | A fixer offers no edit whenever the input is ambiguous | accepted |
| [SLOP-0014](0014-every-edit-is-verified-before-it-is-exposed.md) | Every edit is reparsed and compared with the original before a finding may carry it | accepted |
| [SLOP-0015](0015-every-edit-rides-on-a-visible-finding.md) | An edit is applied only through a visible finding of a fixable policy | accepted |
| [SLOP-0016](0016-fix-behaviour-is-tested-on-real-inputs.md) | Fix behaviour is proven by real-input tests of edits, refusals and stability | accepted |
| [SLOP-0017](0017-budget-findings-are-never-autofixed.md) | Sentence and paragraph budget findings are reported and never autofixed | accepted |
| [SLOP-0018](0018-sentence-budget-finding-estimates-clauses.md) | A sentence budget finding estimates clauses to guide a split | accepted |
| [SLOP-0019](0019-paragraph-budget-finding-suggests-breaks.md) | A paragraph budget finding suggests breaks from lexical cohesion | accepted |
| [SLOP-0020](0020-em-dash-becomes-parentheses-or-colon.md) | An em-dash pair becomes parentheses and a lone em-dash becomes a colon | accepted |
| [SLOP-0021](0021-comma-run-of-code-spans-is-a-hidden-list.md) | A comma-joined run of three or more inline code spans is a hidden list | accepted |
| [SLOP-0022](0022-diagrams-are-measured-by-mermaids-own-parsers.md) | Every diagram is read through Mermaid's own parsers, never by scanning its text | accepted |
| [SLOP-0023](0023-a-diagram-is-a-mermaid-code-node-of-the-host-tree.md) | A diagram is a mermaid code node of the host's tree, mapped back to the source by line | accepted |
| [SLOP-0024](0024-gaps-in-mermaids-parsers-get-the-narrowest-workaround.md) | Where Mermaid exposes nothing, the narrowest workaround is used and refuses when it would guess | accepted |
| [SLOP-0025](0025-colour-and-contrast-come-from-colorjs.md) | Colour parsing, compositing and WCAG contrast come only from colorjs.io | accepted |
| [SLOP-0026](0026-theme-colours-come-from-mermaids-theme-engine.md) | Theme colours come from Mermaid's own theme engine on a pinned Mermaid version | accepted |
| [SLOP-0027](0027-the-page-canvas-is-a-rule-option-that-defaults-to-github.md) | The page canvas is a contrast rule option that defaults to GitHub's light and dark pages | accepted |
| [SLOP-0028](0028-unmodelled-styling-is-an-error-never-a-guess.md) | Styling the contrast audit cannot model is reported as an error, never scored by a guess | accepted |
| [SLOP-0029](0029-thresholds-are-rule-options-not-environment.md) | Complexity thresholds are remark rule options, never environment variables | accepted |
| [SLOP-0030](0030-the-score-counts-what-a-reader-must-read.md) | The visual complexity score counts what a reader must read, not every record the parser keeps | accepted |
| [SLOP-0031](0031-mermaid-policies-report-and-never-edit-a-diagram.md) | Mermaid policies report findings with guidance and never edit a diagram | accepted |
| [SLOP-0032](0032-a-split-plan-is-verified-independently-and-by-reparse.md) | A split plan is offered only after an independent contract and a reparse of every emitted source | accepted |
| [SLOP-0033](0033-a-split-plan-follows-the-authors-structure.md) | A split plan folds the author's own structure first and refuses what it cannot draw faithfully | accepted |
| [SLOP-0034](0034-a-refused-plan-offers-the-list-or-matrix-that-reads-better.md) | A dense mesh or an unsorted star gets no plan, and the finding offers the matrix or list that reads better | accepted |
| [SLOP-0035](0035-a-plan-makes-the-fewest-folds-and-says-why-it-was-flagged.md) | A split plan makes the fewest folds that meet its target, keeps groups even, and says why it was flagged | accepted |
| [SLOP-0036](0036-author-families-keep-groups-apart.md) | Label families the author wrote keep a suggested group to one family under the strict rules | accepted |
| [SLOP-0037](0037-a-group-is-named-by-what-it-holds.md) | A split plan names each group by what it holds, never by one arbitrary member | accepted |
| [SLOP-0038](0038-a-stub-names-exactly-one-thing-and-draws-each-edge-once.md) | A detail's stub text has exactly one reading, and each edge it stands for is drawn once | accepted |
| [SLOP-0039](0039-plain-word-runs-and-min-items.md) | A long plain-word run is a hidden list, and every run rule takes a minItems option | accepted |
| [SLOP-0040](0040-mkdocs-includes-canonical-reference-documents.md) | The MkDocs site includes canonical reference documents at build time | accepted |
| [SLOP-0041](0041-standalone-cli-runs-the-native-remark-engine.md) | The standalone CLI runs the native remark engine with explicit write controls | accepted |
| [SLOP-0042](0042-biome-remains-the-only-typescript-linter.md) | Biome remains the only TypeScript linter with a 120-character wrapping target | superseded |
| [SLOP-0043](0043-eslint-only-enforces-blank-line-placement.md) | ESLint only enforces blank-line placement while Biome owns other TypeScript checks | accepted |
# By group

## architecture

* [SLOP-0003](0003-shared-document-context-per-round.md) - Every enabled policy in a reporting round reads one DocumentContext, so derived data is computed once and agrees
* [SLOP-0009](0009-one-module-per-rule.md) - A prose policy is one file under src/prose/rules that returns diagnostics with any edit, listed in one registry
* [SLOP-0010](0010-shared-code-groups-by-the-data-it-takes.md) - src/document takes source and trees and imports no policy, and policies import the document layer, never the reverse
## cli

* [SLOP-0041](0041-standalone-cli-runs-the-native-remark-engine.md) - A scoped binary supplies the remark engine, default policies and verified source edits
## config

* [SLOP-0006](0006-configuration-is-remark-plugin-options.md) - Policies are switched and tuned through the plugin's options in the host's remark config, with no config file of its own
## documentation

* [SLOP-0040](0040-mkdocs-includes-canonical-reference-documents.md) - Task guides live in docs-site, while a build hook exposes the existing reference documents without duplicate sources
## fixing

* [SLOP-0012](0012-edits-splice-source-never-stringify.md) - An edit replaces a source range, the compiler returns the edited source, and rounds repeat until no edit remains
* [SLOP-0013](0013-a-fixer-refuses-when-unsure.md) - An unfixable case leaves the source untouched and the finding reported, never a best guess
* [SLOP-0014](0014-every-edit-is-verified-before-it-is-exposed.md) - An edit that changes visible words or structure beyond its declared change is withdrawn, alone and as a batch
* [SLOP-0015](0015-every-edit-rides-on-a-visible-finding.md) - A fix travels on the diagnostic its check reports, so a passing or suppressed passage is never rewritten
## mermaid

* [SLOP-0022](0022-diagrams-are-measured-by-mermaids-own-parsers.md) - Mermaid policies take nodes, edges, styles and shapes from Mermaid core and @mermaid-js/parser results
* [SLOP-0023](0023-a-diagram-is-a-mermaid-code-node-of-the-host-tree.md) - Fences come from the mdast tree the remark host supplies, and findings map to absolute Markdown offsets
* [SLOP-0024](0024-gaps-in-mermaids-parsers-get-the-narrowest-workaround.md) - Source alignment, the zenuml detector and declaration reading are small workarounds that place only what is certain
* [SLOP-0025](0025-colour-and-contrast-come-from-colorjs.md) - No hand-written colour parser, luminance formula, alpha blend or contrast ratio
* [SLOP-0026](0026-theme-colours-come-from-mermaids-theme-engine.md) - Both light and dark theme variables are resolved by Mermaid itself, never copied into the package
* [SLOP-0027](0027-the-page-canvas-is-a-rule-option-that-defaults-to-github.md) - Page-backed surfaces are scored on an opaque canvas.light and canvas.dark the host may set
* [SLOP-0028](0028-unmodelled-styling-is-an-error-never-a-guess.md) - Custom themeCSS, unsupported modes and unmodelled surfaces report unauditable instead of passing silently
* [SLOP-0029](0029-thresholds-are-rule-options-not-environment.md) - A density preset and numeric overrides come only from the plugin options a remark configuration commits
* [SLOP-0030](0030-the-score-counts-what-a-reader-must-read.md) - Markers, notes and control lines are left out, and boxes, blocks and attribute rows are counted
* [SLOP-0031](0031-mermaid-policies-report-and-never-edit-a-diagram.md) - Contrast and complexity expose no fix, and a split plan is a recommendation a human applies
* [SLOP-0032](0032-a-split-plan-is-verified-independently-and-by-reparse.md) - The verifier recomputes the expected facts and parses each overview and detail again with Mermaid's parsers
* [SLOP-0033](0033-a-split-plan-follows-the-authors-structure.md) - Author regions, decision regions, aggregates, echoing regions and twin lanes fold whole, and concurrency is refused
* [SLOP-0034](0034-a-refused-plan-offers-the-list-or-matrix-that-reads-better.md) - Shapes no fold can summarise are refused with a reason and a list or matrix built from the whole graph
* [SLOP-0035](0035-a-plan-makes-the-fewest-folds-and-says-why-it-was-flagged.md) - Rows drop before nodes fold, overviews stay above an even floor, and each plan states its measured size and target
* [SLOP-0036](0036-author-families-keep-groups-apart.md) - Dotted namespaces, id prefixes and shared status stems are read as the author's grouping and are not mixed first
* [SLOP-0037](0037-a-group-is-named-by-what-it-holds.md) - Regions, heads, families, lanes, ranges, fans, spans and member lists name a group before any single member does
* [SLOP-0038](0038-a-stub-names-exactly-one-thing-and-draws-each-edge-once.md) - Stubs name their group as the overview shows it, share a box in flowcharts, and never repeat an edge
## model

* [SLOP-0004](0004-lazy-language-view-on-nodes.md) - node.data.language exposes projected text at once and one memoised sentence Promise only when a rule asks for it
* [SLOP-0005](0005-concepts-file-is-project-vocabulary.md) - Each defined heading in CONCEPTS.md in the working directory becomes a literal noun phrase for that context's sentences
## parsing

* [SLOP-0002](0002-host-tree-is-the-document.md) - The adapter hands the host's own tree to createDocument, and only string callers parse, once, with the shared parser
## policy

* [SLOP-0007](0007-a-finding-fails-or-the-policy-is-off.md) - Custom severities accept only error or off, and a Mermaid diagram that cannot be evaluated is an error too
## quality

* [SLOP-0011](0011-code-complexity-is-gated-by-biome.md) - Every Biome complexity rule runs at error, with cognitive complexity capped at 10, and bun run check fails past it
* [SLOP-0042](0042-biome-remains-the-only-typescript-linter.md) - Biome enforces braces and formats at 120 columns, while structural blank lines remain a review convention
* [SLOP-0043](0043-eslint-only-enforces-blank-line-placement.md) - Separate tool responsibilities automate breathing space without competing formatting rules
## rules

* [SLOP-0008](0008-rule-id-is-subsystem-category-and-short-name.md) - Identifiers read subsystem/category-short-name, such as prose/sentence-one-per-line, never a number
* [SLOP-0017](0017-budget-findings-are-never-autofixed.md) - The word and sentence budget policies have no fixer, because shortening or breaking prose is a decision about meaning
* [SLOP-0018](0018-sentence-budget-finding-estimates-clauses.md) - The clause count is the larger of marker words and Compromise verbs, and the message names a target sentence count
* [SLOP-0019](0019-paragraph-budget-finding-suggests-breaks.md) - Paragraphs over the sentence budget report topic groups, break points and content terms per sentence
* [SLOP-0020](0020-em-dash-becomes-parentheses-or-colon.md) - punctuation-em-dash-in-prose rewrites only the two dash shapes whose replacement punctuation is unambiguous
* [SLOP-0021](0021-comma-run-of-code-spans-is-a-hidden-list.md) - list-comma-code-run flags the run anywhere, and its fix promotes it only when it closes a sentence after a lead-in
* [SLOP-0039](0039-plain-word-runs-and-min-items.md) - list-comma-plain-run reports plain series from five items, and minItems sets each run rule's threshold
## testing

* [SLOP-0016](0016-fix-behaviour-is-tested-on-real-inputs.md) - A fixer change is tested for its edit, untouched bytes, refusals, recheck and idempotence, with no mocks
## tooling

* [SLOP-0001](0001-vendor-the-generator-into-the-bundle.md) - The adr skill's renderer is vendored into adrs/ and run by uv, so the bundle renders from a clone alone
# Relationship graph

Open [graph.html](graph.html) to explore the records visually: click a node to read it, and links between records navigate the graph.
The same edge set is rendered as prose in [graph.md](graph.md), and as data in [graph.json](graph.json).

* SLOP-0002 --depended_on_by--> SLOP-0012
* SLOP-0002 --depended_on_by--> SLOP-0003
* SLOP-0003 --depends_on--> SLOP-0002
* SLOP-0003 --extended_by--> SLOP-0004
* SLOP-0003 --see_also--> SLOP-0010
* SLOP-0004 --extends--> SLOP-0003
* SLOP-0004 --depended_on_by--> SLOP-0018
* SLOP-0004 --depended_on_by--> SLOP-0019
* SLOP-0004 --extended_by--> SLOP-0005
* SLOP-0005 --extends--> SLOP-0004
* SLOP-0006 --see_also--> SLOP-0039
* SLOP-0006 --depends_on--> SLOP-0008
* SLOP-0007 --depended_on_by--> SLOP-0028
* SLOP-0008 --extends--> SLOP-0009
* SLOP-0008 --depended_on_by--> SLOP-0006
* SLOP-0009 --extended_by--> SLOP-0008
* SLOP-0009 --depended_on_by--> SLOP-0010
* SLOP-0010 --depends_on--> SLOP-0009
* SLOP-0010 --see_also--> SLOP-0003
* SLOP-0010 --depended_on_by--> SLOP-0011
* SLOP-0011 --depends_on--> SLOP-0010
* SLOP-0012 --depends_on--> SLOP-0002
* SLOP-0012 --depended_on_by--> SLOP-0014
* SLOP-0013 --extended_by--> SLOP-0014
* SLOP-0013 --tested_by--> SLOP-0016
* SLOP-0013 --depended_on_by--> SLOP-0020
* SLOP-0013 --depended_on_by--> SLOP-0021
* SLOP-0014 --depends_on--> SLOP-0012
* SLOP-0014 --extends--> SLOP-0013
* SLOP-0014 --tested_by--> SLOP-0016
* SLOP-0014 --depended_on_by--> SLOP-0017
* SLOP-0014 --extended_by--> SLOP-0015
* SLOP-0015 --extends--> SLOP-0014
* SLOP-0015 --see_also--> SLOP-0021
* SLOP-0016 --tests--> SLOP-0013
* SLOP-0016 --tests--> SLOP-0014
* SLOP-0017 --depends_on--> SLOP-0014
* SLOP-0017 --extended_by--> SLOP-0018
* SLOP-0017 --extended_by--> SLOP-0019
* SLOP-0018 --extends--> SLOP-0017
* SLOP-0018 --depends_on--> SLOP-0004
* SLOP-0019 --extends--> SLOP-0017
* SLOP-0019 --depends_on--> SLOP-0004
* SLOP-0020 --depends_on--> SLOP-0013
* SLOP-0021 --extended_by--> SLOP-0039
* SLOP-0021 --depends_on--> SLOP-0013
* SLOP-0021 --see_also--> SLOP-0015
* SLOP-0022 --excepted_by--> SLOP-0024
* SLOP-0022 --see_also--> SLOP-0023
* SLOP-0022 --depended_on_by--> SLOP-0032
* SLOP-0023 --see_also--> SLOP-0022
* SLOP-0024 --excepts--> SLOP-0022
* SLOP-0025 --see_also--> SLOP-0026
* SLOP-0026 --see_also--> SLOP-0025
* SLOP-0026 --see_also--> SLOP-0027
* SLOP-0026 --depended_on_by--> SLOP-0028
* SLOP-0027 --see_also--> SLOP-0026
* SLOP-0027 --see_also--> SLOP-0028
* SLOP-0028 --depends_on--> SLOP-0026
* SLOP-0028 --see_also--> SLOP-0027
* SLOP-0028 --depends_on--> SLOP-0007
* SLOP-0029 --see_also--> SLOP-0030
* SLOP-0030 --see_also--> SLOP-0029
* SLOP-0030 --see_also--> SLOP-0035
* SLOP-0031 --extended_by--> SLOP-0032
* SLOP-0031 --extended_by--> SLOP-0034
* SLOP-0032 --extends--> SLOP-0031
* SLOP-0032 --depends_on--> SLOP-0022
* SLOP-0032 --tests--> SLOP-0033
* SLOP-0032 --tests--> SLOP-0037
* SLOP-0032 --tests--> SLOP-0038
* SLOP-0033 --tested_by--> SLOP-0032
* SLOP-0033 --see_also--> SLOP-0034
* SLOP-0033 --see_also--> SLOP-0035
* SLOP-0033 --see_also--> SLOP-0036
* SLOP-0034 --extends--> SLOP-0031
* SLOP-0034 --see_also--> SLOP-0033
* SLOP-0035 --see_also--> SLOP-0030
* SLOP-0035 --see_also--> SLOP-0033
* SLOP-0036 --see_also--> SLOP-0033
* SLOP-0036 --see_also--> SLOP-0037
* SLOP-0037 --tested_by--> SLOP-0032
* SLOP-0037 --see_also--> SLOP-0036
* SLOP-0037 --see_also--> SLOP-0038
* SLOP-0038 --tested_by--> SLOP-0032
* SLOP-0038 --see_also--> SLOP-0037
* SLOP-0039 --extends--> SLOP-0021
* SLOP-0039 --see_also--> SLOP-0006
* SLOP-0042 --superseded_by--> SLOP-0043
* SLOP-0043 --supersedes--> SLOP-0042
