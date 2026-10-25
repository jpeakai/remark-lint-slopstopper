---
type: Architecture Decision
title: A detail's stub text has exactly one reading, and each edge it stands for is drawn once
description: Stubs name their group as the overview shows it, share a box in flowcharts, and never repeat an edge
tags: [mermaid, complexity, split, labels]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/splitting/labels/context.ts, the IN and FROM stub forms
  - src/mermaid/splitting/labels/text.ts, rangeEnds and spanEnds, which let a stub for a member a group label names show its own label
  - src/mermaid/splitting/presentation/graphs.ts, boxChoices, which boxes a flowchart detail's stubs for one group while the detail meets its target
  - src/mermaid/splitting/projection/detail.ts and projection/quotient.ts, which draw edges alike from one group into a member once
  - src/mermaid/splitting/validation/recovery.ts, which reads half edges between a group and one member as one half per label and cardinality
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0038 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Tested by [SLOP-0032](0032-a-split-plan-is-verified-independently-and-by-reparse.md) (stub texts must have one reading, and half edges are read as a set)
- See also [SLOP-0037](0037-a-group-is-named-by-what-it-holds.md) (a stub finds its group by the label the overview shows)

## Decision

### The lens

#### Given

a reader of a detail reads each stub as one outside thing and finds it in the overview by its text.
Each line reads as one relationship

#### We prefer

stub text with exactly one reading, over stubs that repeat a group's label or draw one relationship several times.
A member reads as PAYMENT_METHOD (in CUSTOMER (+2)), or by its own label where the group's label already names it.
In a flowchart detail, stubs for one group's members sit inside one box.
Each edge from a whole group into a member is drawn once

#### Because

two stubs with one text read as a duplicate, and three lines from one stub read as three sources.
A bare bracket leaves the reader to guess which group is meant

#### Unless

a box would push a detail over its target or the diagram is not a flowchart.
The stubs are then drawn unboxed with their bracketed group

## Consequences

### Pros

- Every stub can be found in the overview by its exact text.
- Details carry fewer stubs and no duplicated relationships.

### Cons

- A stub's text grows by its group's label and count.
- A target detail shows only that the source group leads to a member, not how many of its members do.
- A box adds a subgraph, which weighs on a detail's score.
