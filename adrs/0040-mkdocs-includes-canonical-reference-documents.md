---
type: Architecture Decision
title: The MkDocs site includes canonical reference documents at build time
description: Task guides live in docs-site, while a build hook exposes the existing reference documents without duplicate sources
tags: [documentation, tooling]
status: accepted
accepted_on: 2026-10-26
enforced_in:
  - docs-site/mkdocs.yml, which defines the reading order and strict link validation
  - docs-site/hooks.py, which exposes canonical repository documents as build-time files
  - pyproject.toml and uv.lock, which resolve the documentation and decision-rendering dependencies
  - the site and site-serve targets in Makefile
generated: { by: human:maintainer, at: 2026-10-26T00:00:00Z }
---

<!-- GENERATED from SLOP-0040 by okf_render.py. Do not edit; edit the .yml and regenerate. -->

## Decision

### The lens

#### Given

consumers need a navigable local site, while the rule and architecture references already have canonical homes

#### We prefer

authored MkDocs guides under docs-site and build-time inclusion of canonical reference documents, with locked Python tooling

#### Because

readers get a curated path from first use to reference without maintaining competing copies of the same contracts

#### Unless

a document gains a different audience or purpose that warrants an independently authored page

## Consequences

### Pros

- A strict build rejects missing internal pages and anchors.
- The local preview watches both guides and canonical reference documents.
- Existing relative document links remain local, while implementation links reach the repository browser.
- The Python project supplies decision-rendering dependencies through its own dependency group.

### Cons

- Building the site needs uv and Python as well as the package's TypeScript tooling.
- The inclusion hook must be updated when a canonical reference document is added or moved.
