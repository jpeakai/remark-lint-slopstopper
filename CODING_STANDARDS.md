# Coding standards

How code in `remark-lint-slopstopper` is written.
Process (adding a policy, verifying a change) lives in [CONTRIBUTING.md](CONTRIBUTING.md).
A rule a tool enforces is a pointer to that tool's config here, never restated prose.

## Baseline tenets

1. **Autoformatting is a must.**
   No hand-formatted code; CI fails on any unformatted file.
2. **Linting runs on the strictest rule set, and every warning is an error.**
3. **Type checking runs on the strictest rule set.**
4. **Unit test coverage stays above 90%.**
   CI fails below the threshold.
5. **Never use mocks.
   Always test real code.**
   Use real dependencies, real temporary files and dependency injection; code that cannot be tested for real is not tested at all.
6. **Never write tests that are tautologies of the implementation.**
   A test asserts observable behaviour against an independently known expected value.
   It never re-derives that value with the code under test.
   It never asserts that the code calls what the code calls.
7. **Complexity is measured and capped wherever the stack has a tool for it.**
   Cyclomatic complexity and maintainability metrics such as Halstead volume run in CI.
   Their thresholds live in the tool's config, and a breach fails the build.

## TypeScript

| Tenet | Enforced by |
|---|---|
| Autoformatting | Biome formatter, written by `bun run format` and checked by `bun run lint` |
| Strict linting, warnings as errors | `biome check --error-on-warnings` in the `lint` script, over the `recommended` preset in `biome.json` |
| Strict type checking | `strict: true` in `config/tsconfig.json`, run by `bun run typecheck` |
| Coverage above 90% | `coverageThreshold` in `bunfig.toml`, which Bun applies to every file and which fails `bun run test` |
| No mocks | Code review |
| No tautological tests | Code review |
| Complexity capped | Every Biome `complexity` rule at `error` in `biome.json`, with `noExcessiveCognitiveComplexity` capped by `maxAllowedComplexity` |

Dead code and unused exports are rejected by Knip in both its default and `--production --strict` modes, configured in `config/knip.json` and run by `bun run lint:dead-code`.
`bun run check` runs every gate above that has a tool, and `.github/workflows/check.yml` runs it on every push and pull request.
Biome skips `adrs/`, which holds generated files and the bundle's own generator.
Keep tests beside the implementation and assert observable behaviour, including failures and disabled policies.
