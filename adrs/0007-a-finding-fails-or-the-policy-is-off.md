---
type: Architecture Decision
title: A custom policy's finding is a fatal error, or the policy is off
description: Custom severities accept only error or off, and a Mermaid diagram that cannot be evaluated is an error too
tags: [policy, severity, mermaid]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/remark/plugin.ts, whose Severity type admits only boolean, 0, 2, off and error, and which marks every emitted message fatal
  - src/mermaid/analyze.ts, which reports a parse failure as mermaid/parse-diagram-unparseable for the selected policy
  - RULES.md, Entry points and severity
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0007 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depended on by [SLOP-0028](0028-unmodelled-styling-is-an-error-never-a-guess.md) (an unauditable surface is a failing finding, not an advisory note)

## Decision

### The lens

#### Given

a check is uncertain enough that failing on it seems harsh, or a diagram cannot be parsed so no policy can evaluate it

#### We prefer

a fatal VFile error for every finding of an enabled custom policy, over a warning level or an advisory that does not fail.
A parse failure is reported as an error attributed to the selected Mermaid policy

#### Because

a run that exits 0 should have nothing to report, and a diagram nobody could evaluate has not passed

#### Unless

the policy is switched off, which also skips its parse checks

## Consequences

### Pros

- The exit code and the reported findings always agree.
- A broken diagram never passes a contrast or complexity gate by being unreadable.

### Cons

- A borderline heuristic must be fixed, removed or switched off rather than softened.
- A parse failure is reported once per enabled Mermaid policy rather than as its own configurable rule.
