---
type: Architecture Decision
title: An em-dash pair becomes parentheses and a lone em-dash becomes a colon
description: punctuation-em-dash-in-prose rewrites only the two dash shapes whose replacement punctuation is unambiguous
tags: [rules, fixing, punctuation]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/prose/rules/punctuation-em-dash-in-prose.ts, which reads only text nodes and offers an edit for the two shapes alone
  - the rule's colocated tests, which pin each refusal condition
  - RULES.md, which documents the two rewrites and the refusals
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0020 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [SLOP-0013](0013-a-fixer-refuses-when-unsure.md) (every pattern outside the two shapes is reported without an edit)

## Decision

### The lens

#### Given

a sentence in running prose contains an em-dash

#### We prefer

replacing a pair around an aside with parentheses and a single dash with a colon, over reporting every dash for a manual rewrite

#### Because

those two shapes have one reading each, so the replacement keeps the meaning

#### Unless

the dash touches punctuation, sits between digits, shares a sentence with a colon, or brackets an aside that looks like an enumeration marker

## Consequences

### Pros

- The most common glyph finding clears without a human.
- Code is exempt by construction, because only text nodes are read.

### Cons

- The rule carries a growing list of refusal conditions.
- The edit changes punctuation, so verification must accept the declared swap rather than demand identical text.
