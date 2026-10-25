---
type: Architecture Decision
title: Shared code sits in the layer whose data it takes, and layers import downwards
description: src/document takes source and trees and imports no policy, and policies import the document layer, never the reverse
tags: [architecture]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/document/, which takes source, trees and nodes and imports only src/types.ts from the rest of the package
  - src/prose/paragraph-plan.ts, which holds the policy-specific grouping the document layer must not own
  - CONTRIBUTING.md, which keeps policy decisions in the rule and reusable projections and language models in src/document
  - ARCHITECTURE.md, which states the document language model never depends on prose policy
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0010 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [SLOP-0009](0009-one-module-per-rule.md) (a helper leaves its policy module only once a second policy needs it)
- See also [SLOP-0003](0003-shared-document-context-per-round.md) (the context says what a policy is handed, and this says where code reading it lives)
- Depended on by [SLOP-0011](0011-code-complexity-is-gated-by-biome.md) (a function split for the complexity limits places its helpers by this rule)

## Decision

### The lens

#### Given

shared code has to live somewhere a reader can predict

#### We prefer

placing a function in the layer whose data it takes, over grouping helpers by which policy calls them.
Imports flow from policies down to the document layer

#### Because

the arguments are visible in the signature while the callers are not.
A downward import graph keeps the document model reusable by plugins and direct callers

#### Unless

a derivation has its own vocabulary, which earns it a named module of its own

## Consequences

### Pros

- remark-lint-slopstopper/document and /language-view export a layer that carries no policy.
- A module's placement is checkable from the signatures inside it.

### Cons

- Sharing a helper costs an import edge where duplication cost none.
- A policy-specific derivation, such as paragraph planning, sits beside its policy rather than with the language model it extends.
