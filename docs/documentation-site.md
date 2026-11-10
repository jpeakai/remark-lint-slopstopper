# Preview the documentation site

The MkDocs Material site combines task guides with this repository's canonical reference documents.
You need Bun and uv installed.

## Build the site

From the repository root, run:

```sh
make site
```

The strict build writes to `tmp/site/`.
Broken page links and missing anchors fail the build.
Python dependencies are resolved from `uv.lock`.
The build bundles Mermaid 12.2.0 for the comparison gallery from the public `mermaid-site` development dependency.
This browser renderer is independent of the package's pinned analysis engine.

## Serve a local preview

Run:

```sh
make site-serve
```

Open <http://127.0.0.1:8010/remark-lint-slopstopper/>.
The server watches authored site pages and the canonical documents it includes.
Stop it with Control-C.
Changes to `examples/` regenerate the gallery pages automatically.
After editing `docs-site/diagrams.js`, run `make site-assets`; the preview watches the resulting bundle.

## Review diagram examples

Open **Examples → Diagram gallery** for the family index and individual comparison pages.
Each page shows the original and revision, Markdown downloads, source disclosure and an enlarged viewer with zoom controls.
The page theme selects the light or dark Mermaid theme unless a diagram pins its own theme.
The gallery uses Mermaid's own SVG styling rather than Material's text-colour overrides.
Deliberately malformed originals display a rendering error while leaving their source available.

The numbered folders under `examples/` are canonical gallery inputs.
The build generates pages in memory; edit `diagram.md` or `diagram-fixed.md`, not generated HTML.
Use **jpai-essentials:mermaidjs-diagrams** from **jpeakai/skills** for repair guidance.
See [the example guide](../examples/README.md) for the repair workflow and skill selection.

## Publish the site

The `Docs` workflow builds the site on every push and pull request, as a check.
It deploys to GitHub Pages only after the `Publish` workflow releases a version, so the live site always matches the latest release.
To redeploy without a release, run `gh workflow run docs.yml --ref main`.

## Choose the source to edit

| Content | Edit here |
| --- | --- |
| Landing page, guides, examples and API summaries | `docs-site/docs/` |
| Rule details | `RULES.md` |
| Package architecture | `ARCHITECTURE.md` |
| Mermaid subsystem contracts | The relevant `src/**/README.md` |
| Accepted decisions | The YAML sources under `adrs/`, then `make fix` |
| Navigation and Markdown extensions | `docs-site/mkdocs.yml` |
| Theme colours and layout | `docs-site/docs/assets/site.css` |
| Diagram comparisons and source downloads | `examples/*/diagram.md` and `diagram-fixed.md` |
| Diagram rendering and zoom controls | `docs-site/diagrams.js` |

The `docs-site/hooks.py` hook exposes canonical pages as build-time files while preserving their relative paths.
Links to other published documents stay local.
Links to implementation files go to the repository browser.
Generated decision documents are read as inputs and remain untouched.

The MkDocs configuration stays under `docs-site/` to keep site rendering settings scoped to the site.
