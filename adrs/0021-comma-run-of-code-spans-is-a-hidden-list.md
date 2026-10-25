---
type: Architecture Decision
title: A comma-joined run of three or more inline code spans is a hidden list
description: list-comma-code-run flags the run anywhere, and its fix promotes it only when it closes a sentence after a lead-in
tags: [rules, list, fixing]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/prose/rules/list-comma-code-run.ts, which counts the run in projected prose, where each code span is one CODE token
  - the rule's colocated tests, which pin what fires, what does not, and each refusal
  - RULES.md, which documents the run, the minItems option and the fixer limits
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0021 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extended by [SLOP-0039](0039-plain-word-runs-and-min-items.md) (plain-word series get their own rule, and minItems tunes this rule's threshold)
- Depends on [SLOP-0013](0013-a-fixer-refuses-when-unsure.md) (a run mid-sentence, without a lead-in, or opening inside a link or emphasis gets no edit)
- See also [SLOP-0015](0015-every-edit-rides-on-a-visible-finding.md) (the check reports runs the fix refuses, so a refused run stays reported rather than silently passing)

## Decision

### The lens

#### Given

comma-joined items that are each only an inline code span, with an optional and or or before the last

#### We prefer

a list rule whose items are only code spans, from three items by default, over one rule that counts any comma series of plain words

#### Because

a series of bare code spans, such as file names, flags or keys, is almost always a real list.
A short series of plain words is ordinary English

#### Unless

a plain-word list can be told from a series by its words alone, which calls for its own rule with a stricter threshold

## Consequences

### Pros

- A run of file names, flags or keys becomes a list a reader can scan.
- A code span followed by content is no bare item, so labelled runs stay with their own rule.

### Cons

- A bare list of plain words, such as service names without backticks, passes this rule.
- A run mid-sentence is reported with no fix, so the author rewrites it by hand.
- Promotion changes block structure, so verification must accept the declared list shape.
