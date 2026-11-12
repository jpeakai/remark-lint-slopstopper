# Glossary

The ubiquitous language for `@jpeakai/remark-lint-slopstopper`.
Each term is written in Title Case wherever it is used, to mark it as this glossary's meaning rather than the plain-language one.
When a new domain term enters the code or the conversation, add it here in the same change.
Give it its own H2 and a place in the diagram.

```mermaid
---
config:
  themeVariables:
    edgeLabelBackground: '#f1f5f9'
---
flowchart LR
    MNT["Maintainer"]:::people
    AGT["Agent"]:::people
    REQ["Requirement"]:::rule
    DRC["Decision Record"]:::record
    GEN["Generated File"]:::record
    DIA["Dialect"]:::record
    POL["Custom Policy"]:::rule
    PRE["Complexity Preset"]:::rule
    DOC["Document Context"]:::pipeline
    CON["Concepts File"]:::info
    DIG["Diagnostic"]:::info
    SPL["Split Plan"]:::info
    IPR["Interpunct Run"]:::info
    LPR["List Promotion"]:::info
    SFA["Surface Analysis"]:::pipeline
    VSC["Viewer Scenario"]:::info
    CNC["Connector"]:::info
    VPR["Viewer Profile"]:::rule
    FBG["Finding Budget"]:::rule

    MNT -- states --> REQ
    REQ -- binds --> AGT
    DRC -- records --> REQ
    DRC -- renders --> GEN
    DIA -- places --> DRC
    PRE -- tunes --> POL
    CON -- feeds --> DOC
    DOC -- serves --> POL
    POL -- reports --> DIG
    DIG -- may carry --> SPL
    DOC -- derives --> IPR
    DIG -- may carry --> LPR
    SFA -- serves --> POL
    MNT -- reviews --> VSC
    SFA -- lists --> CNC
    VPR -- shapes --> SFA
    FBG -- bounds --> DIG

    linkStyle default color:#0f172a

    classDef people    fill:#1e40af,stroke:#93c5fd,color:#fff,stroke-width:2px
    classDef info      fill:#92400e,stroke:#fcd34d,color:#fff,stroke-width:2px
    classDef rule      fill:#6d28d9,stroke:#c4b5fd,color:#fff,stroke-width:2px
    classDef forbidden fill:#b91c1c,stroke:#fca5a5,color:#fff,stroke-width:2px
    classDef pipeline  fill:#047857,stroke:#6ee7b7,color:#fff,stroke-width:2px
    classDef record    fill:#334155,stroke:#cbd5e1,color:#fff,stroke-width:2px
```

## Agent

An AI coding assistant working in this repo, such as Claude Code or Codex.
Every Agent is bound by the instructions in [AGENTS.md](AGENTS.md).

## Complexity Preset

A named set of visual complexity thresholds for Mermaid diagrams, such as `high-density` or `low-density`.
It is distinct from the root export, which is an upstream remark-lint preset.
Definitions live in [`metrics.ts`](src/mermaid/complexity/metrics.ts).

## Concepts File

The `CONCEPTS.md` in the working directory whose headings name project terms for the prose policies.
Only the term names are read, and a missing file is not an error.

## Connector

A line that joins diagram elements, such as a graph edge with its arrowhead, a sequence message line or a lifeline.
Borders, axes and invisible layout links are not Connectors.
The Surface Analysis lists Connectors separately from text, and only the connector contrast policy reads them.

## Custom Policy

One of this package's own lint rules, enabled through `@jpeakai/remark-lint-slopstopper/remark`.
Each has a full identifier such as `prose/sentence-one-per-line`, listed in [`src/rules.ts`](src/rules.ts).

## Decision Record

One accepted decision in [`adrs/`](adrs/), authored as YAML with its markdown generated.
It is never rewritten, and a later Decision Record supersedes it through a typed relation.

## Diagnostic

One finding a Custom Policy reports, carrying its full identifier, a message and a source range.
Its shape is defined in [`src/types.ts`](src/types.ts).

## Dialect

This repo's declared documentation conventions, in [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Document Context

The shared, lazily built view of one markdown document that every Custom Policy reads.
It is created by [`createDocument`](src/document/context.ts).

## Finding Budget

The most Diagnostics one diagram example may report for a rule, surface and theme, with the reason for the known limitation.
Budgets bound regression tests only; the plugin still reports every finding.
They live in [finding-budgets.yml](examples/finding-budgets.yml).

## Generated File

A file rendered from a source by `make fix`, and never edited by hand.

## Interpunct Run

A running paragraph whose prose joins items with interpuncts.
On one source line it is a flat list; stacked over several lines it is a two-level structure.
It is derived in [`interpunct-runs.ts`](src/document/interpunct-runs.ts).

## List Promotion

The automatic edit that turns a list hidden in running prose into a lead-in line and a real Markdown list.
Item text is sliced from the source, and the edit is verified against the list it declares.
It is built in [`promotion.ts`](src/prose/promotion.ts).

## Maintainer

The owner of this repo.
Only the Maintainer states a Requirement.

## Requirement

Something the Maintainer has stated the project must do or must never do.

## Split Plan

A verified recommendation for breaking one over-complex Mermaid diagram into smaller ones.
See [the splitting README](src/mermaid/splitting/README.md).

## Surface Analysis

The theme-by-theme list of text surfaces Mermaid paints in one diagram, with each foreground, background and source line.
Styling it cannot model is listed explicitly instead of guessed.
Mermaid policies read it and own their thresholds; [`analyzeSurfaces`](src/mermaid/contrast/analysis.ts) builds it.

## Viewer Profile

How a host paints Mermaid, set by the contrast policies' `viewer` option: `github` or `mkdocs-material`.
It decides the theme each mode renders and which host colours replace the theme's.
See [Mermaid viewer profiles](RULES.md#mermaid-viewer-profiles).

## Viewer Scenario

One way a reader sees a rendered diagram: a theme, a page background and an image format.
The render verifier draws every diagram example in each Viewer Scenario; see [the runner guide](examples/scripts/README.md#verify-renders).
