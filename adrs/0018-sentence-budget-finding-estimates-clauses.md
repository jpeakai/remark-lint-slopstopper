---
type: Architecture Decision
title: A sentence budget finding estimates clauses to guide a split
description: The clause count is the larger of marker words and Compromise verbs, and the message names a target sentence count
tags: [rules, messages, language]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/document/language-view.ts, whose sentence model counts clauses as the larger of marker matches plus one and doc.verbs()
  - src/prose/rules/sentence-word-budget-exceeded.ts, whose message reports potential clauses and a target sentence count
  - src/prose/analyze.test.ts, which pins the clause and verb signals in the message
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0018 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [SLOP-0017](0017-budget-findings-are-never-autofixed.md) (the rule stays report-only, and its message carries the guidance a rewrite needs)
- Depends on [SLOP-0004](0004-lazy-language-view-on-nodes.md) (the rule reads each sentence and its clause count from the language view)

## Decision

### The lens

#### Given

a sentence exceeds the word budget and a human or an agent must rewrite it

#### We prefer

reporting potential clauses and a target sentence count, over reporting the word count alone.
Potential clauses are the larger of the marker count and the verbs Compromise finds

#### Because

a clause count names where the sentence can split, which steers a rewrite towards splitting rather than compressing into fragments

#### Unless

a deterministic dependency parser that runs in JavaScript replaces both signals, which would supersede the counting method only

## Consequences

### Pros

- Rewrites keep their connective words and read as prose.
- A series of verbs asks for a split per verb even with no marker word.
- The message stays deterministic, with no model call.

### Cons

- Compromise misses some verbs, so a clause joined with no marker can go uncounted.
- A comma before and in a list reads as a clause boundary, so lists overcount.
