---
type: Architecture Decision
title: Mermaid policies report findings with guidance and never edit a diagram
description: Contrast and complexity expose no fix, and a split plan is a recommendation a human applies
tags: [mermaid, fixing, safety]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/rules.ts, whose FIXABLE_RULE is the sentence layout policy alone
  - src/remark/plugin.ts, which selects edits only from visible FIXABLE_RULE findings
  - src/mermaid/complexity/policy.ts, which formats a split plan into the diagnostic message and returns no edit
  - src/mermaid/contrast/policy.ts, which reports ratios and unauditable surfaces without a replacement colour
  - CONTRIBUTING.md, which forbids rewriting Mermaid fences through a generic Markdown serializer
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0031 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extended by [SLOP-0032](0032-a-split-plan-is-verified-independently-and-by-reparse.md) (the plan a finding carries is checked before it is offered, and still never applied)
- Extended by [SLOP-0034](0034-a-refused-plan-offers-the-list-or-matrix-that-reads-better.md) (where no plan fits, the finding carries a list or matrix instead)

## Decision

### The lens

#### Given

a diagram fails contrast or exceeds its acceptable visual complexity score, and many repairs would clear the finding

#### We prefer

reporting the finding with concrete guidance, over rewriting the fence, even under fix true.
Guidance includes the measured ratio or a verified overview and detail sources

#### Because

a replacement colour is a palette choice and a split boundary is a design decision.
Both change what the diagram says, so only the author can make them

#### Unless

never

## Consequences

### Pros

- Running with fix true can never change what a diagram means.
- A complexity finding still names where to cut, not only how small to cut.

### Cons

- Every Mermaid finding needs a human to resolve it, even when black or white text would clearly pass.
- A split plan inside a diagnostic message makes that message long.
