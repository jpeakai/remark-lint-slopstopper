---
type: Architecture Decision
title: A split plan makes the fewest folds that meet its target, keeps groups even, and says why it was flagged
description: Rows drop before nodes fold, overviews stay above an even floor, and each plan states its measured size and target
tags: [mermaid, complexity, split]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/splitting/planning/search.ts, EVEN_SHARE, evenFloorOf, tangled, closed and closedAggregates
  - src/mermaid/splitting/planning/selection.ts, which prefers the near-best fold leaving the fewest parallel overview edges
  - src/mermaid/splitting/planning/candidates.ts, which admits a trimmed aggregate only when it adds no new reachable pair
  - src/mermaid/splitting/presentation/assemble.ts, flaggedText, carried as the plan's flagged field into the finding
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0035 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0030](0030-the-score-counts-what-a-reader-must-read.md) (a plan's overview and details are measured by this score)
- See also [SLOP-0033](0033-a-split-plan-follows-the-authors-structure.md) (how far a plan folds once it follows the author's structure)

## Decision

### The lens

#### Given

a plan can fold more than its node and score targets ask, hiding names for no reason a reader can see.
It can also fold so little that one group holds most of the diagram

#### We prefer

the fewest changes that meet the target, over the smallest overview the folds can reach.
A diagram that fits with its attribute rows dropped folds only its closed aggregates.
An overview walked below 60 percent of node_target gives back a group.
Every plan states the size it was flagged at, its target and which measure is over

#### Because

every fold hides a name or makes pairs reachable, so a fold the target did not ask for is pure loss.
Groups of even size read as parts of one story.
The flagged text tells the reader when rows alone are the problem

#### Unless

a tangled erDiagram, whose independent cycles reach a quarter of its nodes, keeps folding its aggregates evenly past the target.
A tree-like overview reads as it is, and a tangled one does not

## Consequences

### Pros

- A schema over its target only for its rows keeps every entity's name in view.
- The reader sees why a diagram within its node target was flagged at all.

### Cons

- A plan near node_target can keep more nodes in its overview than a smaller fold would.
- The 60 percent floor and the tangled threshold are judgements, not measured values.
