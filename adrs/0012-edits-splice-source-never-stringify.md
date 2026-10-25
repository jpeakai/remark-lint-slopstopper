---
type: Architecture Decision
title: Fixes splice source ranges and the adapter never stringifies the tree
description: An edit replaces a source range, the compiler returns the edited source, and rounds repeat until no edit remains
tags: [fixing, architecture]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/document/edits.ts, whose applyEdits rejects overlapping ranges and splices from the end of the source
  - src/remark/plugin.ts, which reparses after each changed round and replaces the compiler with one that returns the edited source
  - src/remark/plugin.test.ts, which requires headings, code, CRLF, frontmatter offsets and untouched bytes to survive fixes
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0012 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [SLOP-0002](0002-host-tree-is-the-document.md) (ranges are addressed through the offsets the parsed tree supplies)
- Depended on by [SLOP-0014](0014-every-edit-is-verified-before-it-is-exposed.md) (one spliced range is cheap to verify)

## Decision

### The lens

#### Given

a policy wants to change a small part of a document inside a remark host whose default output path stringifies the tree

#### We prefer

splicing replacement text built from source slices into the original string and compiling that string, over editing the tree and serialising it with remark-stringify

#### Because

every byte outside an edit is preserved by construction, so the diff is exactly the fix and the package coexists with any formatter

#### Unless

no source slice can express the change, in which case the policy offers no edit rather than generating markup

## Consequences

### Pros

- Fix diffs are minimal and reviewable.
- Mermaid fences and unrelated Markdown are never rewritten by a generic serializer.

### Cons

- Each fixer reasons about offsets, escapes, indentation and line endings itself.
- Overlapping edits cannot combine in one round and wait for the reparse.
- Replacing the compiler in fix mode overrides any serializer the host configured.
