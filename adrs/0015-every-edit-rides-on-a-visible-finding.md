---
type: Architecture Decision
title: An edit is applied only through a visible finding of a fixable policy
description: A fix travels on the diagnostic its check reports, so a passing or suppressed passage is never rewritten
tags: [fixing, verification]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/types.ts, where TextEdit is an optional fix field on Diagnostic
  - src/remark/plugin.ts, whose visibleEdits takes edits only from findings still visible after remark-message-control, and only from fixable policies
  - src/prose/rules/sentence-one-per-line.ts, which reports both a soft wrap and several sentences on one line, the two shapes its fixer rewrites
  - src/remark/plugin.test.ts, which requires suppressed findings to expose no edit
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0015 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [SLOP-0014](0014-every-edit-is-verified-before-it-is-exposed.md) (beyond a verified edit, no edit touches a passage the check passed)
- See also [SLOP-0021](0021-comma-run-of-code-spans-is-a-hidden-list.md) (that check reports runs its fixer refuses, the other half of keeping check and fix in step)

## Decision

### The lens

#### Given

a check decides what fails and a fixer decides what to rewrite, and native lint comments can hide a finding

#### We prefer

carrying each edit on the diagnostic its check reports, over a separate fix pass that finds its own targets.
Only the edits of visible findings are applied

#### Because

a file that passes the check is then a fixed point of fix mode, and suppressing a finding also suppresses its edit

#### Unless

a fixer refuses a case the check reports, such as a hard break or a blockquote, which leaves the finding for a human

## Consequences

### Pros

- A passing file is never rewritten by fix mode.
- Agents that pack sentences onto one line get a finding, not a silent pass.

### Cons

- The check inherits every sentence-boundary misreading of Compromise, so a wrong boundary is both reported and rewritten.
- A policy gains automatic edits only by an explicit adapter change, because returning a fix alone is ignored.
