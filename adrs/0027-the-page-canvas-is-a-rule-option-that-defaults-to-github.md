---
type: Architecture Decision
title: The page canvas is a contrast rule option that defaults to GitHub's light and dark pages
description: Page-backed surfaces are scored on an opaque canvas.light and canvas.dark the host may set
tags: [mermaid, contrast, configuration]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/contrast/theme.ts, GITHUB_CANVAS and canvasColourProblem
  - src/mermaid/contrast/policy.ts, resolvedCanvas, which merges the canvas option over GitHub's and throws on a bad colour
  - src/types.ts, the canvas field of RuleOptions
  - RULES.md, Mermaid text contrast
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0027 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0026](0026-theme-colours-come-from-mermaids-theme-engine.md) (page-backed surfaces are scored on the canvas)
- See also [SLOP-0028](0028-unmodelled-styling-is-an-error-never-a-guess.md) (a canvas that cannot be read is a usage error, as unmodelled styling is a finding)

## Decision

### The lens

#### Given

translucent fills, edge label backgrounds, diagram titles and page-backed sequence elements are read against the page.
A host other than GitHub draws its own page

#### We prefer

a canvas of opaque light and dark colours set through the mermaid/contrast-text-below-aa rule options, defaulting to GitHub's white and

#### Because

the page is the one rendering assumption a host may change, and one option covers every page-backed surface without modelling each host's theme

#### Unless

a canvas colour is not a CSS colour or is translucent, which throws a TypeError before any diagram is scored.
A canvas that cannot be read would report passes it never affected

## Consequences

### Pros

- A host with its own page colours scores diagrams as its readers see them.
- A configuration that sets no canvas scores exactly what GitHub shows.

### Cons

- The canvas models the page only, so a host that also restyles Mermaid's own surfaces with CSS is not modelled.
- One configuration holds one canvas, so documents rendered on different pages need separate remark configurations.
