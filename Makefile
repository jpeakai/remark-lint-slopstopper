.PHONY: fix ci

# The okf-yaml generator vendored from the adr skill (SLOP-0001). It runs
# without a Python project, so this bun repo carries no pyproject.toml.
RENDER := uv run --no-project --with PyYAML --with Jinja2 --with jsonschema adrs/okf_render.py

# Regenerate everything that is generated. Safe to run at any time.
fix:
	$(RENDER) adrs --schema adrs/record.schema.json

# Assert the tree is clean after a regenerate: a generated file that differs
# means someone hand-edited it, or the source changed without regenerating.
ci: fix
	@test -z "$$(git status --porcelain)" || { \
		git status --short; \
		echo "ERROR: regenerate left the tree dirty - commit the generated files"; \
		exit 1; }
