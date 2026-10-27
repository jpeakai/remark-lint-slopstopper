---
type: Architecture Decision
title: The standalone CLI runs the native remark engine with explicit write controls
description: A scoped binary supplies the remark engine, default policies and verified source edits
tags: [cli, configuration, packaging, fixing]
status: accepted
accepted_on: 2026-10-27
enforced_in:
  - package.json, whose scoped package declares the compiled standalone binary and runtime engine dependency
  - src/cli/arguments.ts, which maps convenience flags into existing plugin options
  - src/cli/run.ts, which delegates discovery and configuration to unified-engine and writes verified source edits only on explicit request
  - src/cli/run.test.ts, which verifies real files, configuration, stdin, suppression, remaining findings and runtime failures
generated: { by: human:maintainer, at: 2026-10-27T00:00:00Z }
---

<!-- GENERATED from SLOP-0041 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Decision

### The lens

#### Given

users need a single bunx command without installing remark-cli or writing a configuration before their first check

#### We prefer

a standalone CLI in the scoped plugin package, backed by unified-engine and the existing policies, with native remark configuration and explicit fix mode

#### Because

one command can supply useful defaults and convenience flags without a second implementation of discovery, suppression, policies or verification

#### Unless

a flag would change a policy's meaning, which requires a separate policy decision

## Consequences

### Pros

- Check mode never writes files even when a remark config requests fixes.
- Explicit fix mode persists verified prose edits despite remaining lint findings, while runtime failures prevent persistence for that file.
- JSON findings are available for automation, and distinct exit codes separate findings from processing errors.
- The compiled JavaScript binary works under Node or Bun without runtime TypeScript stripping inside node_modules.

### Cons

- The package name becomes scoped, so plugin consumers must update their import specifiers.
- Shared CLI budgets remain subject to per-rule configuration overrides.
- A registry-based bunx invocation requires publishing the package after local verification.
