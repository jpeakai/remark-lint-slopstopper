---
type: Architecture Decision
title: Complexity thresholds are remark rule options, never environment variables
description: A density preset and numeric overrides come only from the plugin options a remark configuration commits
tags: [mermaid, complexity, configuration]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/complexity/metrics.ts, whose thresholdsFrom reads only the preset and numeric option fields it is given
  - src/mermaid/complexity/policy.ts, which passes the rule's complexity options or its shared options to thresholdsFrom
  - src/remark/plugin.ts, which merges shared options under each rule's own options
  - the absence of process.env reads anywhere under src/
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0029 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0030](0030-the-score-counts-what-a-reader-must-read.md) (the thresholds are compared against this score)

## Decision

### The lens

#### Given

a project needs different density limits for its diagrams

#### We prefer

setting a preset such as low-density or numeric threshold overrides in the remark plugin options, over environment variables

#### Because

the remark configuration is committed and reviewed, so a verdict is a function of the repository and its configuration alone

#### Unless

never

## Consequences

### Pros

- The same commit gives the same verdict on every machine and in CI.
- Overriding any threshold marks the preset as custom in the message, so the reader knows the limits moved.

### Cons

- A one-off stricter run needs another remark configuration file, passed with --rc-path.
