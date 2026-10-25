---
type: Architecture Decision
title: A split plan names each group by what it holds, never by one arbitrary member
description: Regions, heads, families, lanes, ranges, fans, spans and member lists name a group before any single member does
tags: [mermaid, complexity, split, labels]
status: accepted
accepted_on: 2026-10-25
enforced_in:
  - src/mermaid/splitting/labels/text.ts, rangeLabel, familyLabel, laneLabel, fanLabel, spanLabel, pairLabel, listedOthers and LABEL_CAP
  - src/mermaid/splitting/labels/groups.ts, labelChoices, qualifiedLabel, spanOf, fanOf and groupNaming, which order the choices
  - src/mermaid/splitting/labels/ranking.ts, which names a chain-like group by the member its flow enters at
  - src/mermaid/splitting/validation/labels.ts, which accepts each label form only as recomputed from the group's members
generated: { by: human:maintainer, at: 2026-10-25T00:00:00Z }
---

<!-- GENERATED from SLOP-0037 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Relates to

- Tested by [SLOP-0032](0032-a-split-plan-is-verified-independently-and-by-reparse.md) (every group label is accepted only as recomputed from its members)
- See also [SLOP-0036](0036-author-families-keep-groups-apart.md) (a group holding a whole dotted family is named by it)
- See also [SLOP-0038](0038-a-stub-names-exactly-one-thing-and-draws-each-edge-once.md) (a stub finds its group by the label the overview shows)

## Decision

### The lens

#### Given

a group's name is the first thing a reader reads of it, and is read as a promise about every member.
A name taken from one member promises only that member

#### We prefer

naming a group by what all its members share, over one member's label and a count.
First comes an author region's label, then a decision's question.
A whole dotted family follows as gold.*, then twin lanes by their stages as Extract → bronze.
Next come a range of interchangeable members, the node a set of leaves hangs from, and a flow's entry and exit.
Then comes every member of a small group, as ROOM (+BUILDING), and only then the member a reader enters at

#### Because

a name built from what every member shares promises nothing a member lacks, and a reader enters a chain where it starts

#### Unless

no shared name fits, because a label holds markup, a range would span another group's member, or the label passes 40 characters.
The group then keeps its entry member's label and a count

## Consequences

### Pros

- Overviews read as the diagram's own stages, families and regions.
- A label can never claim a member the group does not hold, because the verifier recomputes it.

### Cons

- Shared names are longer than a member label and a count, so the overview gives them more room.
- The producer and the verifier each carry every label form, which grows with each new form.
- Echoing regions with one label need a qualified name, which is longer still.
