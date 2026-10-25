---
type: Architecture Decision
title: Configuration is remark plugin options, and a disabled policy never runs
description: Policies are switched and tuned through the plugin's options in the host's remark config, with no config file of its own
tags: [config, rules]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/remark/plugin.ts, where RemarkSlopstopperOptions holds fix, shared options and per-rule settings keyed by short name
  - src/types.ts, where RuleOptions declares the typed shared options
  - src/prose/analyze.ts and src/mermaid/analyze.ts, which evaluate only enabled policies
  - README.md and examples/remark.config.mjs, which show the options in a remark config
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0006 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0039](0039-plain-word-runs-and-min-items.md) (minItems is set like any other rule option)
- Depends on [SLOP-0008](0008-rule-id-is-subsystem-category-and-short-name.md) (a per-rule setting is keyed by the short name after the slash)

## Decision

### The lens

#### Given

a project wants to disable a policy, tune its budget or enable fixes, and already configures remark

#### We prefer

plugin options in the host's remark config, over a config file and loader of the package's own.
Shared options are overridden per rule, and severity is limited to error or off

#### Because

the host already finds, loads and merges configuration, and one more file would duplicate that and drift from it

#### Unless

a setting must be shared by tools that are not remark hosts, which calls for a new record

## Consequences

### Pros

- Configuration lives where every other remark plugin's does, including remark-cli's rc files.
- A disabled policy is never evaluated, so a prose-only setup never loads Mermaid.

### Cons

- An unknown short name in a JavaScript config is silently ignored, because only TypeScript checks the keys.
- An invalid budget fails only when its policy first runs, not when the config loads.
- Every enabled policy is an error, so a team cannot downgrade one to a warning.
