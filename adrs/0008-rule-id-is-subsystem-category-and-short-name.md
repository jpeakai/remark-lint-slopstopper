---
type: Architecture Decision
title: A policy identifier is its subsystem, then a category word and a short name
description: Identifiers read subsystem/category-short-name, such as prose/sentence-one-per-line, never a number
tags: [rules, naming, layout]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/types.ts, where PolicyRuleId lists every identifier
  - src/rules.ts, which groups the identifiers into PROSE_RULES and MERMAID_RULES
  - src/remark/plugin.ts, which derives configuration and suppression names from the part after the slash
  - RULES.md, whose policy table lists every full identifier
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0008 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [SLOP-0009](0009-one-module-per-rule.md) (a policy file is named by the short name after the slash)
- Depended on by [SLOP-0006](0006-configuration-is-remark-plugin-options.md) (configuration names a policy by its short name)

## Decision

### The lens

#### Given

every finding, configuration key, suppression comment, heading and test names a policy

#### We prefer

an identifier of the subsystem, a slash, one category word and a short name joined by hyphens, over a sequential number

#### Because

the identifier then says which subsystem owns the policy and what it guards before anyone looks it up

#### Unless

a new policy fits no existing category, which calls for a new category word rather than a catch-all

## Consequences

### Pros

- A finding line explains itself.
- Short names sort by category in a directory listing and in RULES.md.

### Cons

- Identifiers are long in messages, tables and suppression comments.
- Short names must stay unique across subsystems, because configuration drops the subsystem.
