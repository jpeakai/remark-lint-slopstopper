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

## Serve a local preview

Run:

```sh
make site-serve
```

Open <http://127.0.0.1:8010/>.
The server watches authored site pages and the canonical documents it includes.
Stop it with Control-C.

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

The `docs-site/hooks.py` hook exposes canonical pages as build-time files while preserving their relative paths.
Links to other published documents stay local.
Links to implementation files go to the repository browser.
Generated decision documents are read as inputs and remain untouched.

The MkDocs configuration stays under `docs-site/` to keep site rendering settings scoped to the site.
