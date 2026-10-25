---
type: Architecture Decision
title: A paragraph budget finding suggests breaks from lexical cohesion
description: Paragraphs over the sentence budget report topic groups, break points and content terms per sentence
tags: [rules, messages, language]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/prose/paragraph-plan.ts, which scores cohesion from shared content lemmas, back-references and openers and picks budget-respecting breaks
  - src/prose/rules/paragraph-sentence-budget-exceeded.ts, whose message names the topic groups, breaks and cues
  - src/prose/analyze.test.ts, which pins the counting and the suggested breaks
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0019 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [SLOP-0017](0017-budget-findings-are-never-autofixed.md) (like a long sentence, a long paragraph is reported and never moved by a fixer)
- Depends on [SLOP-0004](0004-lazy-language-view-on-nodes.md) (the plan reads sentences and their terms from the paragraph's view)

## Decision

### The lens

#### Given

a running-prose paragraph holds more sentences than the budget, which defaults to five

#### We prefer

a finding that names lexical topic groups and the sentences to break after, over a bare sentence count

#### Because

the cues show where the paragraph wants to break, so a rewrite separates topics instead of deleting sentences

#### Unless

a JavaScript topic segmenter proves better at finding turns, which would supersede the cohesion scoring only

## Consequences

### Pros

- A finding tells a human or an agent where to break, not only that the paragraph is long.
- The guidance is deterministic, with no model call.

### Cons

- Cohesion by shared lemmas misses synonyms, so a topic held together by paraphrase can read as two.
- Compromise's sentence splitting sets the count, so a quoted sentence or an abbreviation can shift it by one.
