---
type: Architecture Decision
title: A split plan is offered only after an independent contract and a reparse of every emitted source
description: The verifier recomputes the expected facts and parses each overview and detail again with Mermaid's parsers
tags: [mermaid, complexity, verification]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/splitting/validation/contract.ts, checkContract, which gathers every violation for a build and its nested builds
  - src/mermaid/splitting/validation/round-trip.ts, which reparses each emitted source and compares its graph with the plan
  - src/mermaid/splitting/validation/recovery.ts, labels.ts and overview.ts, which check recovery, labels, partition, edges and rows
  - src/mermaid/splitting/index.ts, firstPassing, which offers only a build with no violations
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0032 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Extends [SLOP-0031](0031-mermaid-policies-report-and-never-edit-a-diagram.md) (the plan a finding carries is checked before it is offered, and still never applied)
- Depends on [SLOP-0022](0022-diagrams-are-measured-by-mermaids-own-parsers.md) (emitted sources are checked by parsing them again with the same parsers)
- Tests [SLOP-0033](0033-a-split-plan-follows-the-authors-structure.md) (the contract refuses a plan that moves a marker, hides a region or merges an edge)
- Tests [SLOP-0037](0037-a-group-is-named-by-what-it-holds.md) (every group label is accepted only as recomputed from its members)
- Tests [SLOP-0038](0038-a-stub-names-exactly-one-thing-and-draws-each-edge-once.md) (stub texts must have one reading, and half edges are read as a set)

## Decision

### The lens

#### Given

a planner has produced an overview and detail sources for an oversized diagram.
A plausible plan can still lose a node, an edge, a row or a marker

#### We prefer

deriving the expected membership and facts from the original graph apart from the producer's reductions, over trusting the planner's own bookkeeping.
Every emitted source is also reparsed with Mermaid's parsers, and declared loss is recounted

#### Because

the official parsers are the authority on what emitted text says, and a check that reuses the producer's reasoning repeats the producer's mistakes

#### Unless

no candidate ladder passes, when no plan is offered and the finding gives the refusal reason and any contract violations

## Consequences

### Pros

- An offered plan never loses a node or relationship across its overview and details.
- Declared loss, such as new reachable pairs or dropped rows, is a recount, not a claim.

### Cons

- Planning an oversized diagram parses Mermaid again for every emitted source, which slows the complexity policy.
- Every new label or stub form must be taught to the verifier as well as the producer.
