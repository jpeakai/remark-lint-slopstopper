---
type: Architecture Decision
title: Theme selection is delegated to the pinned Mermaid engine, with theme-name renderer branches unauditable per family
description: A pinned theme counts when the pinned Mermaid defines it, unless that family's renderer branches on its name
tags: [mermaid, contrast, accessibility]
status: accepted
accepted_on: 2026-11-12
enforced_in:
  - src/mermaid/contrast/theme.ts, whose themeProblem asks the engine whether it defines the theme and checks THEME_BRANCHES for the family
  - src/mermaid/contrast/analysis.ts and sequence.ts, which report a themeProblem as an unauditable error
  - src/mermaid/contrast/theme.test.ts, which checks every theme the pinned engine ships, an unknown name and a branched family
generated: { by: human:maintainer, at: 2026-11-12T00:00:00Z }
---

<!-- GENERATED from SLOP-0044 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0026](0026-theme-colours-come-from-mermaids-theme-engine.md) (the engine that resolves theme colours also decides which themes exist)
- See also [SLOP-0028](0028-unmodelled-styling-is-an-error-never-a-guess.md) (an unknown theme or an unmodelled renderer branch is reported, not guessed)

## Decision

### The lens

#### Given

a fixed allowlist duplicated the engine's theme registry and rejected themes the engine resolves.
Mermaid silently resolves an unknown name to its default colours.
A few renderers paint some themes differently by name

#### We prefer

accepting any theme the pinned engine defines, with per-family theme names its renderer branches on, over a fixed allowlist or trusting every name.
A defined theme resolves to variables other than the default fallback

#### Because

the engine owns theme colours, so it should own which themes exist.
A renderer branch on a theme name is paint the surface adapters do not model

#### Unless

the engine exposes its theme registry, which would replace the fallback comparison

## Consequences

### Pros

- Themes such as neo and neo-dark are audited without a code change.
- A misspelt theme is an error instead of silently scored as the default theme.
- Only the family whose renderer branches on a theme loses that theme.

### Cons

- THEME_BRANCHES must be re-read from the renderers on every Mermaid bump.
- Detecting an unknown theme costs two extra engine initialisations per pinned theme.
- The runtime stays on Mermaid 11.17.2, which defines the same theme names as the site's Mermaid 12.2.0, so the two can still derive different colours.
