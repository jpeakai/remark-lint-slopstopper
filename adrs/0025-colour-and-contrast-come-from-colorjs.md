---
type: Architecture Decision
title: Colour parsing, compositing and WCAG contrast come only from colorjs.io
description: No hand-written colour parser, luminance formula, alpha blend or contrast ratio
tags: [mermaid, contrast, dependencies]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/contrast/colors.ts, whose wcagRatio, alphaOf, withOpacity and compositeOver call colorjs.io
  - review of every change, which refuses colour maths written outside colors.ts
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0025 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0026](0026-theme-colours-come-from-mermaids-theme-engine.md) (Mermaid resolves the colours, and colorjs.io scores them)

## Decision

### The lens

#### Given

the contrast policy must read a colour, composite a translucent fill over its backdrop and score text against 4.5 to 1

#### We prefer

calling colorjs.io for parsing, gamut clipping, compositing and the WCAG 2.1 ratio, over writing our own colour parser, luminance formula or ratio

#### Because

colorjs.io reads every CSS Color Level 4 syntax and implements the published WCAG 2.1 algorithm.
A copy of that maths can only drift from it

#### Unless

never

## Consequences

### Pros

- A reported ratio matches the WCAG 2.1 definition for every colour syntax a browser reads.
- All colour maths lives in one small module.

### Cons

- Any change to a contrast algorithm waits on colorjs.io's release cadence.
- The contrast policy carries a dependency the prose policies never load.
