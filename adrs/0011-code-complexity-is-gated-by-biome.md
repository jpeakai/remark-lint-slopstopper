---
type: Architecture Decision
title: Code complexity is gated by Biome rules that fail the build
description: Every Biome complexity rule runs at error, with cognitive complexity capped at 10, and bun run check fails past it
tags: [quality, tooling]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - biome.json, which enables the complexity group at error and sets maxAllowedComplexity to 10
  - package.json, whose lint script runs biome check --error-on-warnings inside bun run check
  - .github/workflows/check.yml, which runs bun run check on every push to main and every pull request
  - CODING_STANDARDS.md, whose TypeScript table points at the Biome config
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0011 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [SLOP-0010](0010-shared-code-groups-by-the-data-it-takes.md) (a long function splits into helpers that sit in the layer whose data they read)

## Decision

### The lens

#### Given

every function in the package is linted by bun run check

#### We prefer

Biome complexity rules at error level, over warnings or a separate complexity tool

#### Because

Biome already gates the build, and an error is the only level this repo keeps

#### Unless

a rule produces findings that no refactor can fix without hiding the logic, which calls for a new record

## Consequences

### Pros

- A long fixer is split into steps a reviewer can check one at a time.
- The limits live in the one linter the repo already runs, with no new dependency.

### Cons

- Extracting helpers adds functions and names to the larger modules.
- The limits are numbers, so a function near one may be split where a human would not.
