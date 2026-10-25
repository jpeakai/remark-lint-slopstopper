---
type: Architecture Decision
title: Every policy reads the mdast tree the remark host already parsed
description: The adapter hands the host's own tree to createDocument, and only string callers parse, once, with the shared parser
tags: [parsing, architecture]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/remark/plugin.ts, whose reporter passes the host tree and VFile source to createDocument
  - src/document/context.ts, whose createDocument parses with remark-parse, GFM and frontmatter only when no tree is given
  - src/remark/plugin.test.ts, which requires fresh diagnostics for identical source in different host trees
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0002 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depended on by [SLOP-0012](0012-edits-splice-source-never-stringify.md) (an edit addresses source through the offsets the tree carries)
- Depended on by [SLOP-0003](0003-shared-document-context-per-round.md) (the shared context wraps the one tree of the round)

## Decision

### The lens

#### Given

several policies need to know which bytes are prose and which are structure, and the remark host has already parsed the file

#### We prefer

reading the host's actual mdast tree through one DocumentContext, over each policy reparsing the source or scanning raw lines

#### Because

the tree carries any edits earlier plugins made, and node types give every policy the same exemptions for code, tables and frontmatter

#### Unless

a policy needs bytes the tree loses, such as original spacing or escapes.
It then reads the source through node offsets and the projection

## Consequences

### Pros

- Exemptions are consistent across every policy, because they come from node types rather than heuristics.
- A plugin earlier in the remark chain changes what every policy sees, with no second parse.

### Cons

- The package depends on the unified parser family and its tree types.
- A policy must map tree positions back to source offsets before it can propose an edit.
