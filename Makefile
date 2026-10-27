.PHONY: fix ci site site-serve

# Keep tool caches inside the checkout, including when run from a fresh shell.
export UV_CACHE_DIR := $(CURDIR)/node_modules/.cache/uv
export UV_PROJECT_ENVIRONMENT := $(CURDIR)/node_modules/.cache/docs-venv
export TMPDIR := $(CURDIR)/node_modules/.cache/tmp

RENDER := uv run --locked --only-group adr python adrs/okf_render.py
MKDOCS := uv run --locked --only-group docs mkdocs

# Regenerate everything that is generated. Safe to run at any time.
fix: | tooling-dirs
	$(RENDER) adrs --schema adrs/record.schema.json

# Assert the tree is clean after a regenerate: a generated file that differs
# means someone hand-edited it, or the source changed without regenerating.
ci: fix
	@test -z "$$(git status --porcelain)" || { \
		git status --short; \
		echo "ERROR: regenerate left the tree dirty - commit the generated files"; \
		exit 1; }

.PHONY: tooling-dirs
tooling-dirs:
	mkdir -p $(TMPDIR) $(UV_CACHE_DIR)

site: | tooling-dirs
	$(MKDOCS) build --strict --config-file docs-site/mkdocs.yml

site-serve: | tooling-dirs
	$(MKDOCS) serve --config-file docs-site/mkdocs.yml
