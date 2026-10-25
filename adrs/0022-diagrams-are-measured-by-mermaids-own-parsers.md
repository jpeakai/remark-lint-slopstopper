---
type: Architecture Decision
title: Every diagram is read through Mermaid's own parsers, never by scanning its text
description: Mermaid policies take nodes, edges, styles and shapes from Mermaid core and @mermaid-js/parser results
tags: [mermaid, parsing]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/parsing/engine.ts, which owns the Mermaid lifecycle, type detection and the bounded memoBySource cache
  - src/mermaid/parsing/statistics.ts and src/mermaid/parsing/adapters/, which read official databases and typed Langium models
  - src/mermaid/parsing/graph.ts, the canonical graph projection every split plan starts from
  - src/mermaid/styling/declarations.ts, which reads style declarations through the official parser callbacks
  - review of every change, per CONTRIBUTING.md, which keeps official parser access inside the serial Mermaid job
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0022 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Excepted by [SLOP-0024](0024-gaps-in-mermaids-parsers-get-the-narrowest-workaround.md) (the few places Mermaid exposes nothing, each with one narrow workaround)
- See also [SLOP-0023](0023-a-diagram-is-a-mermaid-code-node-of-the-host-tree.md) (the fence a diagram comes from is read from the host tree)
- Depended on by [SLOP-0032](0032-a-split-plan-is-verified-independently-and-by-reparse.md) (emitted sources are checked by parsing them again with the same parsers)

## Decision

### The lens

#### Given

a Mermaid policy needs what a diagram says.
That covers its structure of nodes, edges, rows and regions.
It also covers shapes, labels and style declarations

#### We prefer

reading them from the result of Mermaid core and @mermaid-js/parser, over a regular expression, tokeniser or hand-written parser over the diagram text

#### Because

the official parsers implement the grammar the renderer draws, so a second reading can only drift from what a reader sees.
It would also double the code to test

#### Unless

the parser rejects the diagram, which then becomes a positioned mermaid/parse-diagram-unparseable error attributed to the selected policy, never a guessed reading

## Consequences

### Pros

- Counts, colours and split plans describe the diagram Mermaid draws.
- A Mermaid release that changes the grammar changes this package's reading with it.

### Cons

- The package depends on mermaid, its parser and a Happy DOM shim that must be repaired before Mermaid loads.
- Some parser results are internal shapes, so a Mermaid upgrade can break an adapter and only the tests catch it.
- Mermaid's parser and theme state are mutable singletons, so every diagram is analysed in one serial queue.
