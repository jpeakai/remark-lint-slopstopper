# AGENTS.md

Operating instructions for agents working in `remark-lint-slopstopper`.

Read [docs/CONVENTIONS.md](docs/CONVENTIONS.md) before creating, moving or renaming any document.
It is the declared dialect and it outranks any general convention.

## Commands

```sh
bun run check  # typecheck, lint, dead-code scan and tests
make fix       # regenerate the ADR bundle
make ci        # regenerate, then assert the tree is clean
```

## Decisions

Accepted decisions live in [`adrs/`](adrs/), starting at [`adrs/index.md`](adrs/index.md).
Check existing decisions before raising an open question, and self-answer from a record where one applies.
Record a new binding decision as a new `adrs/NNNN-slug.yml` in the same change that makes it, then run `make fix`.
An accepted record is never rewritten; a later decision supersedes it through a typed relation.

## Language

[GLOSSARY.md](GLOSSARY.md) is the canonical vocabulary for this repo.
Use its terms for every identifier, filename and piece of prose, never an ad-hoc synonym.
When a new domain term enters the code or the conversation, add it to the glossary in the same change.

## Never

- Never edit a generated file.
  Everything in `adrs/` except the `.yml` records, `record.schema.json`, `okf_render.py` and `templates/` is generated.

## More

- [CODING_STANDARDS.md](CODING_STANDARDS.md) for how code is written.
- [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a policy.
- [ARCHITECTURE.md](ARCHITECTURE.md) for how the package is laid out.
