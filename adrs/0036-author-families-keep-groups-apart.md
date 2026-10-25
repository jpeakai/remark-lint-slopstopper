---
type: Architecture Decision
title: Label families the author wrote keep a suggested group to one family under the strict rules
description: Dotted namespaces, id prefixes and shared status stems are read as the author's grouping and are not mixed first
tags: [mermaid, complexity, split]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/splitting/labels/stems.ts, stageOf, statusFamilies, mixesFamilies and oneFamily
  - src/mermaid/splitting/planning/constraints.ts, STRICT, LOOSE and RELAXED, the rule sets walked in order
  - src/mermaid/splitting/planning/candidates.ts, which reads a status family for labels leading with a bare id
  - src/mermaid/splitting/strategies/communities.ts, idFamilies, which offers each id family whole before any pair
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0036 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- See also [SLOP-0033](0033-a-split-plan-follows-the-authors-structure.md) (label families are the author's grouping too)
- See also [SLOP-0037](0037-a-group-is-named-by-what-it-holds.md) (a group holding a whole dotted family is named by it)

## Decision

### The lens

#### Given

labels often carry the author's grouping, while modularity alone happily mixes them.
It shows as a dotted prefix such as gold., an id prefix such as PLAT- or br_, or a status word shared by id-led labels

#### We prefer

keeping every community-based group to one family under the strict rules, over grouping by modularity gain alone.
Each id family is offered whole first.
Families mix only on a later, looser walk when the target cannot otherwise be met

#### Because

ticket keys, table namespaces and pipeline stages are the author's own grouping, so a group mixing two reads as wrong whatever its modularity

#### Unless

the diagram meets its target only with families mixed, when the looser rule sets run in order

## Consequences

### Pros

- Ticket graphs and data pipelines fold one family or stage per group.
- Mixing families is a visible last resort rather than an accident of ranking.

### Cons

- A family read from an id prefix or a stem can be wrong, and under the strict rules it forbids a merge.
- Diagrams that need mixed families are walked more than once, which costs time.
