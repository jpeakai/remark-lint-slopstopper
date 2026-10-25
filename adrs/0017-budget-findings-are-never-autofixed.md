---
type: Architecture Decision
title: Sentence and paragraph budget findings are reported and never autofixed
description: The word and sentence budget policies have no fixer, because shortening or breaking prose is a decision about meaning
tags: [rules, scope]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/prose/rules/sentence-word-budget-exceeded.ts and src/prose/rules/paragraph-sentence-budget-exceeded.ts, which return diagnostics with no fix
  - src/rules.ts, where FIXABLE_RULE names sentence-one-per-line alone
  - RULES.md, whose policy table lists no automatic edit for either budget
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0017 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [SLOP-0014](0014-every-edit-is-verified-before-it-is-exposed.md) (verification forbids the word changes a length fix would need)
- Extended by [SLOP-0018](0018-sentence-budget-finding-estimates-clauses.md) (the sentence finding estimates clauses to guide a split)
- Extended by [SLOP-0019](0019-paragraph-budget-finding-suggests-breaks.md) (the paragraph finding suggests where to break)

## Decision

### The lens

#### Given

a sentence exceeds its word budget or a paragraph exceeds its sentence budget

#### We prefer

reporting the finding with guidance for a human or an agent to rewrite, over any mechanical split, trim or paragraph break

#### Because

every shortening changes words and every break decides which sentences belong together, and both are choices about meaning

#### Unless

never

## Consequences

### Pros

- Fix mode never rewrites meaning.

### Cons

- A fix run can finish with findings left, so the run still fails until someone edits.
- The quality of the rewrite depends entirely on how well the finding's message guides it.
