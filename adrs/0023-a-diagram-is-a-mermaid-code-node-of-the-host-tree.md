---
type: Architecture Decision
title: A diagram is a mermaid code node of the host's tree, mapped back to the source by line
description: Fences come from the mdast tree the remark host supplies, and findings map to absolute Markdown offsets
tags: [mermaid, markdown, parsing]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/markdown.ts, whose fences visits code nodes with lang mermaid and whose sourceLocation maps a diagram line to Markdown offsets
  - src/mermaid/analyze.ts, which evaluates each fence independently in document order
  - src/mermaid/corpus.test.ts and examples/multiple-diagrams.md, which exercise many fences in one document
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0023 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0022](0022-diagrams-are-measured-by-mermaids-own-parsers.md) (the fence's text is then read only through Mermaid's parsers)

## Decision

### The lens

#### Given

a Mermaid policy needs the diagrams of a document and a position for each finding

#### We prefer

taking every code node whose language is mermaid from the host's actual mdast tree, over scanning the Markdown for fence lines.
A diagram-relative line maps back to the Markdown source

#### Because

the tree gives exactly the fences the renderer draws, including ones inside lists and quotes.
It never mistakes Markdown-looking text inside another code block for a diagram

#### Unless

the parser omits a fence's position, which throws rather than reporting at a guessed offset

## Consequences

### Pros

- Every diagram a GFM renderer would draw is checked, and nothing else is.
- A finding points at the line inside the fence, in the file the host is linting.

### Cons

- A fence tagged mermaid with extra info-string words is still read as a diagram.
- A finding inside a fence can only be placed as precisely as Mermaid's own line numbers allow.
