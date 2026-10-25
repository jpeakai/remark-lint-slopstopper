---
type: Architecture Decision
title: Styling the contrast audit cannot model is reported as an error, never scored by a guess
description: Custom themeCSS, unsupported modes and unmodelled surfaces report unauditable instead of passing silently
tags: [mermaid, contrast, accessibility]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/contrast/policy.ts, which reports "Contrast cannot be audited" for themeCSS and every skipped surface
  - src/mermaid/contrast/surfaces.ts and src/mermaid/contrast/surfaces/, which return a reason for a surface they cannot resolve
  - src/mermaid/contrast/sequence.test.ts and surfaces.test.ts, which hold unauditable cases to an error
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0028 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [SLOP-0026](0026-theme-colours-come-from-mermaids-theme-engine.md) (what the theme engine cannot resolve is reported, not assumed)
- See also [SLOP-0027](0027-the-page-canvas-is-a-rule-option-that-defaults-to-github.md) (a canvas that cannot be read is a usage error, as unmodelled styling is a finding)
- Depends on [SLOP-0007](0007-a-finding-fails-or-the-policy-is-off.md) (an unauditable surface is a failing finding, not an advisory note)

## Decision

### The lens

#### Given

a diagram uses styling whose rendered text colour or background the audit cannot derive.
Examples are custom themeCSS, an unsupported rendering mode or a surface with no model

#### We prefer

reporting a mermaid/contrast-text-below-aa error that names the selector and the reason, over skipping the surface or scoring an assumed colour

#### Because

a skipped or guessed surface reads as a pass the audit never earned.
The reader who cannot see the text is the one the rule exists for

#### Unless

never

## Consequences

### Pros

- A clean contrast run means every text surface was actually scored in both themes.
- The message tells the author which styling to replace with supported Mermaid colours.

### Cons

- A diagram whose custom CSS is readable still fails until the CSS is replaced or the rule is suppressed.
- Each newly supported diagram family needs a surface model before its styled diagrams can pass.
