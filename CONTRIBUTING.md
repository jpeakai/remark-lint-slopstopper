# Contributing documentation policies

Start with the [package architecture](ARCHITECTURE.md), then choose the prose or Mermaid entry point below.
The custom plugin is exported as `@jpeakai/remark-lint-slopstopper/remark`; the root `@jpeakai/remark-lint-slopstopper` export is an upstream recommended preset.
Adding a custom policy does not automatically enable it in the root preset.

## Add a prose rule

1. Add its identifier to `PolicyRuleId` in [`src/types.ts`](src/types.ts) and `PROSE_RULES` in [`src/rules.ts`](src/rules.ts).
2. Implement the check under `src/prose/rules/` and colocate its behaviour tests.
3. Register the check in [`src/prose/analyze.ts`](src/prose/analyze.ts), which selects enabled rules and supplies the shared context and every enabled policy's options.
4. Return `Diagnostic[]` with the full identifier, a useful message and absolute UTF-16 source ranges.
5. Document the rule and verified examples in [RULES.md](RULES.md), and update [README](README.md) for configuration or default changes.

Keep policy decisions in the rule; put reusable source projections and language models in `src/document/`.
Every enabled custom rule is an error.
The adapter derives short configuration and suppression names from the registry, so do not duplicate rule lists there.
Add options to `RuleOptions` when a typed shared option is needed; per-rule settings override shared defaults.

## Reuse the document model

Accept `DocumentContext` when called by an orchestrator.
For direct callers, `createDocument(source, {tree, cwd})` is exported as `@jpeakai/remark-lint-slopstopper/document`.
Pass the actual host tree when available; reparsing source alone would lose upstream tree edits.
The optional `cwd` controls project vocabulary and defaults to the process working directory.

Use these entry points for assertions:

| Need | Entry point |
| --- | --- |
| Paragraphs with structural context | `document.paragraphs`, including `ancestors` |
| Prose eligibility | `runningProse(paragraph)` excludes table ancestry |
| Every text node, including table and heading text | `document.textNodes` |
| Rendered paragraph or text content | `document.projection(node).text` |
| Source range for projected characters | `projection.offsets` and `projection.endOffsets` |
| Sentences, word counts and lexical signals | `await document.language(node).sentences` |
| A language view for a following plugin | `node.data.language` |
| Original bytes and line endings | `document.source`, `document.eol` |

For example, an asynchronous assertion can inspect a sentence without owning NLP setup:

```ts
import assert from "node:assert/strict";
import { createDocument } from "@jpeakai/remark-lint-slopstopper/document";

const document = createDocument("The parser validates requests.");
const paragraph = document.paragraphs[0];
assert.ok(paragraph);
const view = document.language(paragraph.node);
assert.equal(view.requested, false);
const [sentence] = await view.sentences;
assert.ok(sentence?.terms.has("validate"));
assert.equal(sentence.wordCount, 4);
```

`LanguageSentence.start` and `end` are relative to projected text, not directly to Markdown source.
Map a sentence start through `projection.offsets[sentence.start]` and its last character through `projection.endOffsets[sentence.end - 1]`.
Do not add the paragraph offset blindly: escapes, entities, links and inline formatting change the mapping.
Use the current rules as examples for empty ranges and unsupported layouts.
Inline code projects as `CODE`; do not treat it as natural-language content.

Language is lazy: reading text or serialising the tree does not trigger NLP.
All policies reading the same node share one sentence Promise within a context.
Request sentences only when the enabled rule needs them, and do not add a second NLP pass.

## Work with project concepts

The first sentence request reads `CONCEPTS.md` in `VFile.cwd` for the remark plugin.
Direct contexts use their supplied `cwd` or the process working directory.
There is no ancestor search or global vocabulary cache.
All node views share a lazy vocabulary snapshot per context; a fresh context can observe file changes.

Supported definitions are a level-two or deeper heading immediately followed by a paragraph.
For example:

```markdown
## Work Bundle

A durable group of related tasks.

## Dispatch Record

A recorded handoff between workers.
```

Define aliases as separate heading entries; tables and list-only definitions are not extracted.
Only term names are imported, not surrounding definitions or fenced examples.
Compromise's literal lookup tags matching phrases as nouns in each sentence document.
Do not call global `addWords`, pass a project lexicon into the constructor, or mutate shared NLP world state.
This is lexical guidance, not semantic understanding; budgets still count each visible word.
Missing concepts files are optional, while other read failures remain visible.

## Add a Mermaid policy

1. Add the identifier to `PolicyRuleId` and `MERMAID_RULES` in the common registry.
2. Implement it in the appropriate Mermaid subsystem and register dispatch in [`src/mermaid/analyze.ts`](src/mermaid/analyze.ts).
3. Extend the analyser's enabled-rule guard so a configuration containing only the new policy still executes.
4. Reuse canonical statistics and the fence reporter for Markdown positions.
5. Cover enabled and disabled behaviour, malformed syntax, multiple fences, source positions and style isolation.

Document the policy's identifier, options, example findings, corrections and fixer limits in [RULES.md](RULES.md).

Keep official parser access within the serial Mermaid job.
Do not extract diagram syntax with regular expressions when the canonical parser model supplies it.
Reuse the contrast surface and Color.js layers for colour assertions.
Consult the [Mermaid README](src/mermaid/README.md) and [split planner README](src/mermaid/splitting/README.md) for their local contracts.

## Add an automatic edit deliberately

A diagnostic carries a `fix` only after `document.safeEdit(edit, expectation)` accepts it.
Declare the exact change the edit makes:

| Expectation | Edit |
| --- | --- |
| `same-tree` | Whitespace only |
| `same-shape` | A glyph swap |
| `replace-paragraph` | A List Promotion |

Offer no edit when the input is ambiguous, and leave the finding for a human.
Add the policy to `FIX_ORDER` in [`src/rules.ts`](src/rules.ts); the adapter applies one policy's visible edits per round in that order.
Preserve the `validateBatch` check in the prose orchestrator, which verifies each policy's edits together.

Source ranges must not overlap.
Suppression must run before edit selection, then the adapter reparses and reports until stable.
Do not serialise unrelated Markdown or rewrite Mermaid fences through a generic Markdown serializer.
Verify targeted edits, unchanged surrounding bytes, recheck and idempotence.

## Verify the change

For documentation-site changes, run `make site` and review `make site-serve` locally.
See [the site workflow](docs/documentation-site.md) for the source map and preview address.

For CLI changes, run `bun run build` and `node dist/cli.js --help` as well as the package checks.
Verify the packed binary when changing dependencies, exports or the `bin` entry.

From the repository root:

```sh
bun run check
bun run test:node
```

The package check runs the gates listed in the [coding standards](CODING_STANDARDS.md): formatting, strict linting, strict TypeScript, both Knip modes and tests with per-file coverage.
Write tests to the [coding standards](CODING_STANDARDS.md).
For Mermaid changes, use the multi-diagram corpus and independently verify complete split outcomes where affected.
For documentation diagrams, run the published Mermaid parse, complexity and dual-theme contrast gate.

Update the [package architecture](ARCHITECTURE.md) for shared contract changes, the [Mermaid README](src/mermaid/README.md) for subsystem changes, and the [splitting README](src/mermaid/splitting/README.md) for planner changes.
