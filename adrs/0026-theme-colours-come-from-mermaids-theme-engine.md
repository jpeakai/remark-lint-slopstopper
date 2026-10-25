---
type: Architecture Decision
title: Theme colours come from Mermaid's own theme engine on a pinned Mermaid version
description: Both light and dark theme variables are resolved by Mermaid itself, never copied into the package
tags: [mermaid, contrast, accessibility]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/contrast/theme.ts, whose resolveThemes initialises Mermaid per theme, reads the resolved themeVariables and restores the prior configuration
  - src/mermaid/contrast/sequence.ts and sequence-model.ts, which score sequence surfaces from those resolved variables
  - package.json, which pins mermaid to an exact version
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0026 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0025](0025-colour-and-contrast-come-from-colorjs.md) (Mermaid resolves the colours, and colorjs.io scores them)
- See also [SLOP-0027](0027-the-page-canvas-is-a-rule-option-that-defaults-to-github.md) (page-backed surfaces are scored on the canvas)
- Depended on by [SLOP-0028](0028-unmodelled-styling-is-an-error-never-a-guess.md) (what the theme engine cannot resolve is reported, not assumed)

## Decision

### The lens

#### Given

many diagram colours are theme variables Mermaid derives from each other and from frontmatter or init configuration.
So is every colour of a sequence diagram without style directives

#### We prefer

resolving the light and dark themes with Mermaid's own theme engine, over copying Mermaid's palettes into the package.
The engine runs on an exactly pinned mermaid, inside a transaction that restores its configuration

#### Because

derived colours change between Mermaid releases, and a copy drifts silently while a pin changes only in a reviewed bump

#### Unless

the diagram sets its own theme, which Mermaid then applies to both viewer themes

## Consequences

### Pros

- A diagram that passes reads in both themes on the pinned Mermaid.
- Frontmatter and init directives merge the way the renderer merges them.

### Cons

- A host rendering with another Mermaid version may derive other colours than the ones scored.
- Mermaid's configuration is a global, so each resolution runs serially and must restore it.
