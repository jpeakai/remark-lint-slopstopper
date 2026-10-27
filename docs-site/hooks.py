"""Expose canonical repository documents without maintaining a second copy."""

from pathlib import Path
import re
from urllib.parse import urlsplit

from mkdocs.structure.files import File

ROOT = Path(__file__).resolve().parent.parent
REPOSITORY = "https://github.com/jpeakai/remark-lint-stopslop"
ROOT_PAGES = (
    "README.md", "RULES.md", "ARCHITECTURE.md", "CONTRIBUTING.md",
    "CODING_STANDARDS.md", "GLOSSARY.md", "AGENTS.md", "TICKETING.md",
    "docs/CONVENTIONS.md", "docs/documentation-site.md", "docs/cli.md",
    "src/mermaid/README.md", "src/mermaid/splitting/README.md",
)


def source_links(markdown, source, published):
    """Keep published relative links and route other repo files to the source."""
    def replace(match):
        target = match.group(1)
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or not parsed.path or parsed.path.startswith("/"):
            return match.group(0)
        absolute = (ROOT / source).parent / parsed.path
        try:
            relative = absolute.resolve().relative_to(ROOT).as_posix()
        except ValueError:
            raise ValueError(f"Link leaves the repository: {source}: {target}")
        if relative in published:
            return match.group(0)
        if not absolute.exists():
            raise ValueError(f"Missing link target: {source}: {target}")
        kind = "tree" if absolute.is_dir() else "blob"
        suffix = f"#{parsed.fragment}" if parsed.fragment else ""
        return f"]({REPOSITORY}/{kind}/main/{relative}{suffix})"

    return re.sub(r"\]\(([^\s)]+)\)", replace, markdown)


def on_files(files, config):
    pages = [*ROOT_PAGES, *(p.relative_to(ROOT).as_posix() for p in sorted((ROOT / "adrs").glob("*.md")))]
    published = set(pages) | {"adrs/graph.html", "adrs/graph.json"}
    for source in pages:
        content = source_links((ROOT / source).read_text(), source, published)
        files.append(File.generated(config, source, content=content))
    for name in ("graph.html", "graph.json"):
        source = f"adrs/{name}"
        files.append(File.generated(config, source, content=(ROOT / source).read_bytes()))
    return files
