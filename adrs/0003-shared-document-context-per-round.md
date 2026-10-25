---
type: Architecture Decision
title: Whole-document data is derived once per round on a shared DocumentContext
description: Every enabled policy in a reporting round reads one DocumentContext, so derived data is computed once and agrees
tags: [architecture, rules]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/remark/plugin.ts, whose reporter builds one DocumentContext per round and passes it to every configured policy
  - src/document/context.ts, where projections and language views are memoised in context-local WeakMaps
  - src/prose/analyze.ts, which hands the same context to every enabled prose rule
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0003 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Depends on [SLOP-0002](0002-host-tree-is-the-document.md) (the context wraps the host tree of the round)
- Extended by [SLOP-0004](0004-lazy-language-view-on-nodes.md) (language analysis is the costliest data the context shares)
- See also [SLOP-0010](0010-shared-code-groups-by-the-data-it-takes.md) (the context says what a rule is handed, and that record says where code reading it lives)

## Decision

### The lens

#### Given

several policies need data derived from the whole document or from the same node, such as projections, sentences or interpunct runs

#### We prefer

deriving that data at most once per reporting round on a DocumentContext every policy receives, over each policy computing what it needs

#### Because

shared data makes the agreement between policies structural, and a fix round starts from a fresh context so no stale result survives an edit

#### Unless

the data is local to one policy, which keeps it inside that policy's module

## Consequences

### Pros

- Three prose policies reading one paragraph share one projection and one sentence analysis.
- A policy module reads as context in, diagnostics out.

### Cons

- Each fix round rebuilds the context, so derived data is recomputed after every applied edit.
- Anything added to the context becomes a contract every policy and direct caller of createDocument can rely on.
