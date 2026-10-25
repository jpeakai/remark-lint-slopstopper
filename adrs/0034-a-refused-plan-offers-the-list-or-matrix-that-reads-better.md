---
type: Architecture Decision
title: A dense mesh or an unsorted star gets no plan, and the finding offers the matrix or list that reads better
description: Shapes no fold can summarise are refused with a reason and a list or matrix built from the whole graph
tags: [mermaid, complexity, split]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/splitting/index.ts, isDenseMesh, isStar, DENSE_MESH, STAR and refuseFor
  - src/mermaid/splitting/presentation/alternatives.ts, starList and meshMatrix, which build the alternative from the original graph
  - src/mermaid/splitting/presentation/alternatives.test.ts
  - src/mermaid/complexity/policy.ts, which prints the alternative in the finding
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0034 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [SLOP-0031](0031-mermaid-policies-report-and-never-edit-a-diagram.md) (where no plan fits, the finding carries a list or matrix instead)
- See also [SLOP-0033](0033-a-split-plan-follows-the-authors-structure.md) (a diagram with no structure to fold gets a list or matrix)

## Decision

### The lens

#### Given

some diagrams cannot be summarised by folding.
One is a mesh joining at least half of its node pairs, with nodes averaging more than four links.
Another is a star whose leaves nothing but alphabet sorts

#### We prefer

refusing a plan for a dense mesh or for alphabetical buckets, over offering a fold that still reads as either.
A dense mesh is refused before planning, and so is any overview that is one.
Buckets means every group is an alphabetical run of one star's sibling leaves.
The refusal prints a Markdown adjacency matrix or list built from the complete original graph

#### Because

folding a mesh leaves a mesh, since its groups join each other too.
A bucket by range gives a reader nothing to find.
A matrix or list tells the diagram's whole story in reading order

#### Unless

the diagram has structure a plan can fold, when the plan is offered instead

## Consequences

### Pros

- A refused finding still gives the reader a complete, readable replacement for the diagram.
- No plan is offered that does not make the diagram easier to read.

### Cons

- A star or mesh refusal prints a long list or a wide table in the diagnostic.
- The list and matrix show labels as plain text, so markup inside a label appears literally.
- A dense diagram that an author might still want folded gets no plan.
