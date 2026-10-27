---
type: Architecture Decision
title: ESLint only enforces blank-line placement while Biome owns other TypeScript checks
description: Separate tool responsibilities automate breathing space without competing formatting rules
tags: [quality, formatting, tooling]
status: accepted
accepted_on: 2026-10-27
enforced_in:
  - eslint.config.mjs, whose explicit rule set only controls blank-line placement
  - biome.json, which retains required braces, the 120-character target and code-quality rules
  - package.json, whose format and lint scripts apply and check both tools
  - CODING_STANDARDS.md, which defines the tool boundary and formatter order
generated: { by: human:maintainer, at: 2026-10-27T00:00:00Z }
---

<!-- GENERATED from SLOP-0043 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Supersedes [SLOP-0042](0042-biome-remains-the-only-typescript-linter.md) (Blank-line placement becomes automatic through a narrowly scoped companion linter)

## Decision

### The lens

#### Given

readable TypeScript needs enforced breathing space and competing formatter rules would create churn

#### We prefer

ESLint only for blank-line placement alongside Biome for formatting and code quality, over overlapping rule sets or unenforced spacing

#### Because

separation of concerns prevents the tools fighting while retaining automatic visual boundaries

#### Unless

Biome supplies equivalent blank-line rules, making the companion configuration redundant

## Consequences

### Pros

- Returns, throws, completed control flow, functions, methods and comments gain enforced visual separation.
- Related declarations and consecutive assertions can remain grouped without reordering code.
- Biome alone owns indentation, quotes, wrapping, required braces and code-quality checks.
- The format command runs the tools in a fixed order and convergence is verified on real source files.

### Cons

- Contributors install ESLint, Stylistic and the TypeScript parser as development dependencies.
- Syntax-based spacing cannot determine every logical test phase, so review still checks the meaning of groups.
