---
type: Architecture Decision
title: Every edit is reparsed and compared with the original before a finding may carry it
description: An edit that changes visible words or structure beyond its declared change is withdrawn, alone and as a batch
tags: [fixing, safety, verification]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/document/context.ts, whose safeEdit compares the reparsed structure and visible words with the original for one edit
  - src/document/context.ts, whose validateBatch strips every edit when the combined result fails the same comparison
  - src/prose/analyze.ts, which validates the batch of every prose round before returning it
  - CONTRIBUTING.md, under Add an automatic edit deliberately
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0014 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [SLOP-0012](0012-edits-splice-source-never-stringify.md) (verification is cheap because an edit is a single spliced range)
- Extends [SLOP-0013](0013-a-fixer-refuses-when-unsure.md) (verification withdraws an edit on behalf of a fixer that did not refuse)
- Tested by [SLOP-0016](0016-fix-behaviour-is-tested-on-real-inputs.md) (tests assert the words, structure and surrounding bytes an edit must keep)
- Depended on by [SLOP-0017](0017-budget-findings-are-never-autofixed.md) (shortening text changes the words verification protects)
- Extended by [SLOP-0015](0015-every-edit-rides-on-a-visible-finding.md) (a verified edit is applied only through a finding that is still visible)

## Decision

### The lens

#### Given

a fixer has proposed an edit and a finding is about to carry it to the adapter

#### We prefer

reparsing the edited source and comparing its structure and visible words with the original, alone and as a batch, over trusting the fixer's own logic

#### Because

a change the fixer did not declare is either a fixer bug or a case it did not foresee, and neither may reach the file

#### Unless

never; a fixer whose change alters punctuation or structure on purpose declares the exact change it expects, and anything beyond it is withdrawn

## Consequences

### Pros

- A fixer bug shows up as a finding left without an edit, never as a silent content change.
- Two edits that are each safe but unsafe together never land in one round.
  The first is kept and the rest wait for the next.

### Cons

- Every candidate edit costs a reparse of the whole document.
- A withdrawn edit is silent, so a fixer bug reads as a refusal unless a test expects the fix.
- A fixer that changes punctuation or structure must state its expected change, which the whitespace-only comparison alone cannot express.
