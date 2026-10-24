# Documentation Conventions

How `remark-lint-slopstopper` organises its documentation.
Agents and humans: consult this before creating, moving or renaming any doc.
Lines marked *(defaulted)* come from the `standard` flavour rather than from what the repo already does, so the Maintainer can veto them.

## Dialect

- **Flavour:** standard, with the ADR surface on `okf-yaml`
- **Docs taxonomy:** root reference docs (`ARCHITECTURE.md`, `RULES.md`), a `README.md` architecture note beside each subsystem under `src/`, and flat kebab-case topic files under `docs/` *(defaulted)*
- **Glossary:** `GLOSSARY.md` at root, one H2 per Title Case term in alphabetical order under one relationship diagram, new terms added in the same change
- **ADR layout:** `okf-yaml`, with records authored in `adrs/NNNN-slug.yml` and markdown generated from them
- **Record ids:** prefixed `SLOP-`, enforced by the id pattern in `adrs/record.schema.json`
- **Generated paths:** `adrs/*.md`, `adrs/index.md`, `adrs/graph.md`, `adrs/graph.json`, `adrs/graph.html`
- **Regenerate:** `make fix`, and `make ci` asserts the tree is clean afterwards
- **Agent files:** `AGENTS.md` at root is canonical, and `CLAUDE.md` beside it holds only `@AGENTS.md`; no nested agent files
- **Ticketing:** GitHub Issues, per `TICKETING.md`
- **Changelog:** `CHANGELOG.md` at root, Keep a Changelog with SemVer, required at the first external consumer *(defaulted)*
- **Proposals and RFCs:** not used *(defaulted)*

## Layout map

| Path | Charter | Audience | Changes when |
|---|---|---|---|
| `README.md` | Orientation, install, configuration and routing | Consumers | Purpose or entry points change |
| `CONTRIBUTING.md` | How to add a policy, extend the document model and verify a change | Contributors | The dev workflow changes |
| `CODING_STANDARDS.md` | How code is written, with pointers to the tool configs that enforce it | Contributors and Agents | A coding convention is adopted or retired |
| `AGENTS.md` | Agent invariants and pointers, no restated conventions | Agents | Commands or hard boundaries change |
| `CLAUDE.md` | Exactly `@AGENTS.md`, nothing else | Claude Code | Never |
| `GLOSSARY.md` | Ubiquitous language, one canonical term per concept | Both | A domain term enters code or conversation |
| `ARCHITECTURE.md` | Package boundaries, shared models, event and data flow | Contributors | A shared contract changes |
| `RULES.md` | Reference for every lint rule, its options and its verified examples | Consumers | A rule, option or default changes |
| `TICKETING.md` | How work is tracked in GitHub Issues | Contributors and Agents | The ticketing workflow changes |
| `src/**/README.md` | Architecture of the subsystem in that directory | Contributors | That subsystem's design changes |
| `examples/` | Runnable remark configs and sample markdown fixtures | Consumers | An entry point or option changes |
| `adrs/*.yml` | Immutable accepted decisions, authored as data | Both | A binding decision is made |
| `adrs/record.schema.json`, `adrs/okf_render.py`, `adrs/templates/` | The bundle's schema and the generator vendored from the adr skill | Contributors | The generator is re-vendored |
| `adrs/*.md`, `adrs/graph.*` | Generated reading surface for those records | Both | Never edited, only regenerated |
| `docs/CONVENTIONS.md` | This dialect declaration | Both | A documentation convention changes |
| `CHANGELOG.md` | Missing: release notes, required at the first external consumer | Consumers | A version is released |
| `LICENSE` | Missing: the licence the package ships under | Consumers | The licence changes |
| `SECURITY.md` | Missing: how to report a vulnerability | Consumers | The reporting route changes |

## Naming

- Root meta-files are UPPERCASE.
- A subsystem's architecture note is the `README.md` of its directory.
- Files inside `docs/` are lowercase kebab-case.
- Records are `NNNN-slug.yml`, and a number is never reused.

## Pointers

- ADR directory: `adrs/`
- Docs site source: none
- Project vocabulary for the prose policies: `CONCEPTS.md` in the working directory, per `CONTRIBUTING.md`

## Required cross-links

- `AGENTS.md` points here, and at the ADR surface with a check-before-you-ask instruction.
- `AGENTS.md` points at `GLOSSARY.md` with both standing instructions.
- `README.md` points at `CONTRIBUTING.md`.
- `CONTRIBUTING.md` and `AGENTS.md` point at `CODING_STANDARDS.md`.
- `CONTRIBUTING.md` points at each architecture doc a change must update.

## Split and merge triggers

- A subsystem under `src/` earns its own `README.md` when its design no longer fits a section of `ARCHITECTURE.md`.
- `docs/` adopts Diátaxis folders when it passes roughly ten files.
