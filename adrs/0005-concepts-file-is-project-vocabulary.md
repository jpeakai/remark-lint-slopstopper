---
type: Architecture Decision
title: A project's CONCEPTS.md supplies the term names the language view tags as nouns
description: Each defined heading in CONCEPTS.md in the working directory becomes a literal noun phrase for that context's sentences
tags: [model, language, concepts]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/document/concepts.ts, which reads CONCEPTS.md from the working directory and keeps headings of depth two or more followed by a paragraph
  - src/document/language-view.ts, which tags the terms with Compromise's lookup and never calls the global addWords
  - src/document/context.ts and src/remark/plugin.ts, which pass VFile.cwd or the caller's cwd and share one lazy snapshot per context
  - src/document/concepts.test.ts, which pins the parse, a missing file and a failing read
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0005 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [SLOP-0004](0004-lazy-language-view-on-nodes.md) (the view tags project terms before it builds sentences)

## Decision

### The lens

#### Given

a project keeps its domain terms as headings in a CONCEPTS.md, and Compromise misreads many of them as verbs or adjectives

#### We prefer

reading that file's heading names as a per-context noun vocabulary, over a vocabulary option in the remark config

#### Because

the file is already where the project names its terms, so a second copy in configuration would drift from it

#### Unless

a project needs concepts from several files or from an ancestor directory, which calls for an option and a new record

## Consequences

### Pros

- Domain phrases no longer distort clause counts, content terms or cohesion cues.
- A missing file is an empty vocabulary, so a project without one runs unchanged.
- No process-global NLP state changes, so contexts never leak terms into each other.

### Cons

- Only the working directory is inspected, so linting from another directory silently drops the vocabulary.
- Aliases, tables and list-only glossaries are not extracted, so each term needs its own heading.
- Findings depend on a file other than the one checked, so editing CONCEPTS.md can move them.
