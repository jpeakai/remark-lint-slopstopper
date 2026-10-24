---
type: Architecture Decision
title: The bundle carries its own copy of the okf-yaml generator, schema and templates
description: The adr skill's renderer is vendored into adrs/ and run by uv, so the bundle renders from a clone alone
tags: [tooling, okf-yaml]
status: accepted
accepted_on: 2026-10-24
provenance: This package is installed and read from its own repository, so its decisions must render from a clone alone, and the adr skill ships okf_render.py with a golden fixture that a verbatim copy inherits
enforced_in:
  - adrs/okf_render.py, adrs/templates/ and adrs/record.schema.json
  - the fix target in the Makefile, which renders the bundle against the vendored schema
  - the ci target, which fails when a regenerate leaves the tree dirty
generated: { by: human:maintainer, at: 2026-10-24T00:00:00Z }
---

<!-- GENERATED from SLOP-0001 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Decision

### The lens

#### Given

the reference generator is a single Python file whose only dependencies uv can supply without a project

#### We prefer

vendoring the skill's generator unchanged into adrs/ and running it with uv run --no-project, over depending on a shared package or porting it to TypeScript

#### Because

a clone of this repo then renders and gates its decisions with nothing outside it, while the copy stays provably the convention's

#### Unless

the repo gains its own Python project, at which point the generator's dependencies move into it

## Consequences

### Pros

- The bundle renders from this repo alone, with no package fetched from another repo.
- The only local divergence is the id pattern in the schema, so an upstream fix arrives by copying.

### Cons

- The repo carries Python it does not maintain, in a style that is not its own.
- The vendored copy drifts from the skill silently, because nothing checks the skill for changes.
- Rendering needs uv and access to pypi.org on first run.
