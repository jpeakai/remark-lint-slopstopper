---
type: Architecture Decision
title: A fixer offers no edit whenever the input is ambiguous
description: An unfixable case leaves the source untouched and the finding reported, never a best guess
tags: [fixing, safety]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/prose/rules/sentence-one-per-line.ts, which attaches no edit inside a blockquote, beside a hard break or at an encoded space
  - every fix in src/prose/rules, which returns a finding without an edit for a shape it cannot rewrite with certainty
  - src/prose/analyze.test.ts, which requires blockquotes, hard breaks and a split that would create a list to stay lint-only
  - RULES.md, which documents each policy's fixer limits
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0013 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extended by [SLOP-0014](0014-every-edit-is-verified-before-it-is-exposed.md) (verification withdraws an edit on behalf of a fixer that did not refuse)
- Tested by [SLOP-0016](0016-fix-behaviour-is-tested-on-real-inputs.md) (each refusal is pinned by a test whose output equals its input)
- Depended on by [SLOP-0020](0020-em-dash-becomes-parentheses-or-colon.md) (the em-dash fixer refuses every shape outside two)
- Depended on by [SLOP-0021](0021-comma-run-of-code-spans-is-a-hidden-list.md) (the fixer refuses a run mid-sentence, without a lead-in, or opening inside markup)

## Decision

### The lens

#### Given

a fixer cannot be sure its rewrite keeps the author's meaning

#### We prefer

reporting the finding without an edit, over applying the most likely rewrite

#### Because

the finding still fails the run, so a human sees the case, while a wrong fix hides it permanently

#### Unless

never

## Consequences

### Pros

- An applied fix can be trusted without reading the diff line by line.

### Cons

- Some fixable prose stays reported until a human edits it.
- Each fixer carries a list of refusal conditions that grows with every hostile case found.
