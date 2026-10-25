---
type: Architecture Decision
title: A split plan folds the author's own structure first and refuses what it cannot draw faithfully
description: Author regions, decision regions, aggregates, echoing regions and twin lanes fold whole, and concurrency is refused
tags: [mermaid, complexity, split]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/splitting/index.ts, which refuses sequence diagrams, unsupported families and concurrent state regions, and tries author-region ladders first
  - src/mermaid/splitting/strategies/regions.ts, which folds an author region whole and folds echoing regions in one step
  - src/mermaid/splitting/graph/flow-regions.ts, which finds single-entry single-exit decision regions from Stately's dominator tree
  - src/mermaid/splitting/graph/ownership.ts and strategies/entities.ts, which group erDiagram entities by identifying parent and keep junctions out of either side
  - src/mermaid/splitting/strategies/patterns.ts, which folds twin chains whole first and in runs of lanes only inside a detail split again
  - src/mermaid/splitting/planning/search.ts, MAX_DEPTH, which lets a detail split once more
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0033 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Tested by [SLOP-0032](0032-a-split-plan-is-verified-independently-and-by-reparse.md) (the contract refuses a plan that moves a marker, hides a region or merges an edge)
- See also [SLOP-0034](0034-a-refused-plan-offers-the-list-or-matrix-that-reads-better.md) (a diagram with no structure to fold gets a list or matrix)
- See also [SLOP-0035](0035-a-plan-makes-the-fewest-folds-and-says-why-it-was-flagged.md) (how far a plan folds once it follows the author's structure)
- See also [SLOP-0036](0036-author-families-keep-groups-apart.md) (label families are the author's grouping too)

## Decision

### The lens

#### Given

an oversized diagram can be folded many ways, and some folds say something the original does not

#### We prefer

folding the author's own structure first and whole, over folding by graph communities alone.
That structure means subgraphs, a decision with its region up to where its branches rejoin, and an erDiagram aggregate under its identifying root.
Echoing regions fold to the same depth, and twin chains fold as one group

#### Because

a reader trusts the author's boundaries first.
A structure folded whole keeps a decision's branches, a composite's markers and an aggregate's ownership together without inventing a path

#### Unless

the structure cannot be drawn faithfully, as with sequence diagrams whose graph drops message order or composites with concurrent regions, which get no plan

## Consequences

### Pros

- A diagram with subgraphs is split along them, as its author would split it.
- Decision-heavy flows fold into named checks without adding reachable pairs.

### Cons

- Sequence diagrams and concurrent state diagrams never get a split plan.
- An author region holding most of a diagram makes an overview dominated by one group, its detail split again.
- Recursion stops at two levels, so a very large region may get no plan.
