---
type: Architecture Decision
title: The visual complexity score counts what a reader must read, not every record the parser keeps
description: Markers, notes and control lines are left out, and boxes, blocks and attribute rows are counted
tags: [mermaid, complexity, parsing]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/parsing/adapters/sequence.ts, which counts messages and leaves out notes, activations and control lines
  - src/mermaid/parsing/adapters/graphs.ts, which drops state markers and notes and counts entity attributes and class members as rows
  - src/mermaid/complexity/metrics.ts, calculateComplexity and its edge, row, subgraph and depth weights
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0030 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0029](0029-thresholds-are-rule-options-not-environment.md) (the thresholds are compared against this score)
- See also [SLOP-0035](0035-a-plan-makes-the-fewest-folds-and-says-why-it-was-flagged.md) (a plan's overview and details are measured by this score)

## Decision

### The lens

#### Given

a parser's result holds records with nothing to read, such as a start marker or a block's closing line.
It also files some things a reader does read, such as attributes, outside its nodes

#### We prefer

counting nodes, edges, boxes, blocks and rows, over counting every record the parser keeps.
A row weighs a quarter of a node and an edge half, and markers, notes and control lines are left out

#### Because

the score stands for what a reader must find, trace and hold.
A record with nothing to read inflates it, and a missed row or boundary deflates it

#### Unless

a family draws a record the reader must place, as a fork or a choice is, which stays a node

## Consequences

### Pros

- A sequence diagram with notes and activations scores its messages, not every statement.
- A large entity or class scores higher than an empty one.

### Cons

- The row and edge weights are judgements, not measured values.
- Each family needs its own adapter decision about what a reader reads.
