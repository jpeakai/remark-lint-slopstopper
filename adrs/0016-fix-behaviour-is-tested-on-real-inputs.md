---
type: Architecture Decision
title: Fix behaviour is proven by real-input tests of edits, refusals and stability
description: A fixer change is tested for its edit, untouched bytes, refusals, recheck and idempotence, with no mocks
tags: [testing, fixing]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - CONTRIBUTING.md, under Add an automatic edit deliberately
  - CODING_STANDARDS.md, whose tenets forbid mocks and tautological tests
  - src/remark/plugin.test.ts, which runs fixes through a real remark processor and checks stable output
  - bunfig.toml, whose coverageThreshold fails bun run test below 90 percent per file
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0016 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Tests [SLOP-0013](0013-a-fixer-refuses-when-unsure.md) (each refusal is pinned by a test whose output equals its input)
- Tests [SLOP-0014](0014-every-edit-is-verified-before-it-is-exposed.md) (tests assert the words, structure and surrounding bytes an edit must keep)

## Decision

### The lens

#### Given

a change touches how any policy fixes prose

#### We prefer

tests that run the real remark processor on real and hostile inputs, over example tests of the happy path alone.
They assert the targeted edit, the untouched bytes, each refusal, the recheck and a second run that changes nothing

#### Because

a fixer's worst bug is a meaning change on input nobody wrote a fixture for, and each hostile case found becomes a named test

#### Unless

never

## Consequences

### Pros

- A regression in a fixer fails a named test before it reaches a document.
- Tests exercise remark, the adapter and suppression together, as a consumer runs them.

### Cons

- Running a real processor makes the suite slower than unit tests of the fix function alone.
- Hostile inputs are only as good as the cases someone thinks of, since no generated inputs explore the rest.
