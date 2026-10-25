---
type: Architecture Decision
title: Paragraph and text nodes carry a language view that analyses on first read
description: node.data.language exposes projected text at once and one memoised sentence Promise only when a rule asks for it
tags: [model, language]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/document/language-view.ts, whose non-enumerable sentences getter loads Compromise and memoises one Promise
  - src/document/context.ts, whose attachViews sets data.language on every paragraph and text node
  - src/document/language-view.test.ts and src/remark/plugin.test.ts, which pin laziness and that prose-only runs never load Mermaid
  - package.json, which exports the view as remark-lint-slopstopper/language-view
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0004 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [SLOP-0003](0003-shared-document-context-per-round.md) (the view is the language data the context shares)
- Depended on by [SLOP-0018](0018-sentence-budget-finding-estimates-clauses.md) (the clause count reads each sentence from the view)
- Depended on by [SLOP-0019](0019-paragraph-budget-finding-suggests-breaks.md) (the break plan reads sentences and their terms from the view)
- Extended by [SLOP-0005](0005-concepts-file-is-project-vocabulary.md) (the view tags project terms before it builds sentences)

## Decision

### The lens

#### Given

several policies, and plugins that run after this one, want the sentences, word counts and terms of a paragraph or a text node

#### We prefer

a lazy view on each node whose sentences are one memoised Promise, over each rule running its own NLP pass or analysing every node eagerly

#### Because

a node no rule asks about is never analysed, and every reader gets the same answer.
Serialising or walking the tree never starts NLP by accident

#### Unless

a rule needs language data across paragraphs, which calls for a document-level view and a new record

## Consequences

### Pros

- A following remark plugin reads the same sentences from node.data.language with no import.
- A Mermaid-only configuration never loads Compromise.

### Cons

- Every prose check is async because sentences arrive as a Promise, so the checks are awaited one after another.
- Compromise's tags and sentence boundaries become part of what a reader relies on, so an upgrade can move findings.
- A text view is a fragment, so its sentences end wherever inline markup starts.
