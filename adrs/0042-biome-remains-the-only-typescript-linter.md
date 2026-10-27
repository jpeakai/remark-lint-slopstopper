---
type: Architecture Decision
title: Biome remains the only TypeScript linter with a 120-character wrapping target
description: Biome enforces braces and formats at 120 columns, while structural blank lines remain a review convention
tags: [quality, formatting, tooling]
status: superseded
accepted_on: 2026-10-27
enforced_in:
  - biome.json, which sets a 120-character target, required braces and a 50-line function cap excluding blank lines
  - package.json, whose format command limits unsafe fixes to required braces before running the formatter
  - CODING_STANDARDS.md, whose readability section defines reviewed structural spacing
generated: { by: human:maintainer, at: 2026-10-27T00:00:00Z }
---

<!-- GENERATED from SLOP-0042 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Superseded by [SLOP-0043](0043-eslint-only-enforces-blank-line-placement.md) (ESLint now owns blank-line placement only, with Biome retaining formatting and code-quality checks)

## Decision

### The lens

#### Given

compact TypeScript needs breathing space, but maintaining a second linter adds unwanted tooling

#### We prefer

Biome as the single linter and formatter, with required braces, a 120-character target and reviewed blank-line conventions

#### Because

the existing tool handles the native rules and preserves readable spacing without introducing another linter

#### Unless

automated blank-line enforcement becomes more important than the cost of an additional tool or a maintained Biome plugin

## Consequences

### Pros

- Contributors retain one TypeScript linter and formatter.
- Returns, completed control flow, functions and methods have reviewed visual separation.
- Related variables, type definitions, imports and class fields can stay grouped.
- The 50-line function cap counts code without penalising readability gaps.

### Cons

- Biome preserves intentional blank lines but does not enforce the complete placement convention.
- Code review must maintain logical grouping and test phase boundaries.
- The 120-character setting is a wrapping target rather than a hard limit for indivisible source text.
