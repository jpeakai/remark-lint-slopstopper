---
type: Architecture Decision
title: Each policy lives in its own module named by its short name
description: A prose policy is one file under src/prose/rules that returns diagnostics with any edit, listed in one registry
tags: [architecture, layout]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/prose/rules/, where each file is named by a policy's short name
  - src/rules.ts, the registry of policy identifiers, and src/prose/analyze.ts, which maps each identifier to its check
  - src/document/, which holds only machinery shared by more than one policy
  - CONTRIBUTING.md, under Add a prose rule
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0009 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extended by [SLOP-0008](0008-rule-id-is-subsystem-category-and-short-name.md) (the short name a file is named by starts with the policy's category)
- Depended on by [SLOP-0010](0010-shared-code-groups-by-the-data-it-takes.md) (a helper leaves its policy module only once a second policy needs it)

## Decision

### The lens

#### Given

the package holds independent policies, and some gain a fixer

#### We prefer

one module per policy, over grouping policies by theme in larger files.
Each module is named by the policy's short name and holds its check and any edit it proposes.
Shared machinery lives in src/document

#### Because

the identifier is how findings, configuration, suppression comments and tests name a policy, so the file tree mirrors it

#### Unless

two policies share a detector, in which case the detector moves to its own module

## Consequences

### Pros

- A policy and its tests can be read without the rest of the package.

### Cons

- Adding a policy touches three places, the type union, the registry and the orchestrator.
- Which policies may fix lives in the adapter and the registry, away from the policies themselves.
