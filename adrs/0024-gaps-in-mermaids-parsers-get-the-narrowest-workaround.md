---
type: Architecture Decision
title: Where Mermaid exposes nothing, the narrowest workaround is used and refuses when it would guess
description: Source alignment, the zenuml detector and declaration reading are small workarounds that place only what is certain
tags: [mermaid, parsing, dependencies]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/styling/source.ts, whose sourceLines anchors a parsed line only when exactly one body line past the frontmatter can be it
  - src/mermaid/styling/lexer.ts, which recovers a statement's position from the official lexer's tokens
  - src/mermaid/styling/properties.ts, which follows Mermaid's declaration ordering and unsetting
  - src/mermaid/parsing/engine.ts, which registers a one-line zenuml detector through registerExternalDiagrams
  - src/mermaid/splitting/labels/text.ts, whose htmlEntities reverses Mermaid's entity placeholders
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0024 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Scoped exception to [SLOP-0022](0022-diagrams-are-measured-by-mermaids-own-parsers.md) (the only places the package does not take a fact straight from Mermaid's result)

## Decision

### The lens

#### Given

a feature needs something Mermaid does not expose.
Examples are a map from Mermaid's preprocessed text back to the diagram source, a detector for zenuml, or Mermaid's reading of a style declaration

#### We prefer

one workaround per gap, as small as the gap, over a custom parser or a text match that picks a best guess.
A workaround places a value only when one reading is possible, and otherwise refuses

#### Because

each workaround stays reviewable at the size of its gap, and a refusal keeps a finding from pointing at frontmatter or a line Mermaid dropped

#### Unless

Mermaid exposes the missing piece, when the workaround is deleted and Mermaid is called instead

## Consequences

### Pros

- Every place the package does not read Mermaid's result directly can be listed and reviewed.
- A position that could be wrong is never reported as certain.

### Cons

- Some declarations are never placed in the source, so their findings point at the fence rather than the line.
- The declaration reader and entity placeholders mirror Mermaid internals that an upgrade can change without a type error.
