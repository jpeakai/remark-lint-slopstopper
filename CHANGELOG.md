# Changelog

Every change a user of `@jpeakai/remark-lint-slopstopper` can see, by release.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package follows [semantic versioning](https://semver.org/).
While the package is at `0.x`, a minor release may break the public surface.
Anything under `Unreleased` is on `main` but not yet released.

## Unreleased

## 0.1.0 - 2026-10-28

### Added

- The default export, a preset that enables GitHub Flavored Markdown and the recommended remark-lint rules.
- The `./remark` plugin with the prose and Mermaid policies that [RULES.md](RULES.md) documents.
- Automatic edits for the sentence layout, list promotion and punctuation policies, each verified by reparsing.
- The `remark-lint-slopstopper` CLI, which runs every policy without a config.
- Node builds and type declarations for every entry point, so the package runs on Node as well as Bun.
