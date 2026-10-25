---
type: Architecture Decision
title: A long plain-word run is a hidden list, and every run rule takes a minItems option
description: list-comma-plain-run reports plain series from five items, and minItems sets each run rule's threshold
tags: [rules, list, fixing, configuration]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/prose/rules/list-comma-plain-run.ts, whose default threshold is five items
  - src/prose/promotion.ts, where minItemsOf rejects any value that is not a whole number of at least 2
  - RULES.md, which documents each run rule's minItems default
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0039 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [SLOP-0021](0021-comma-run-of-code-spans-is-a-hidden-list.md) (plain-word series get their own rule, and minItems tunes the code-run threshold too)
- See also [SLOP-0006](0006-configuration-is-remark-plugin-options.md) (minItems is set like any other rule option)

## Decision

### The lens

#### Given

a short plain-word series is ordinary English, while a long one is almost always a list

#### We prefer

a plain-word run rule that reports from five items by default, over a fixed threshold shared by all run rules.
Every run rule also takes a minItems option

#### Because

length is what tells a list from a series, and where that line sits is each project's call

#### Unless

a project needs a different threshold per file, which plugin options alone cannot express

## Consequences

### Pros

- A long list of service names or channels without backticks is reported.
- A project can tune each run rule up or down without switching it off.

### Cons

- Without a colon lead-in the first item is never counted, so a run can be reported one item late.
- Raising the flat interpunct rule's minItems hands shorter runs to punctuation-interpunct-in-prose, so list findings become glyph findings.
