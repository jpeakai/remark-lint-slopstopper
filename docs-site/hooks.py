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
    add_examples(files, config)
    for asset in sorted((ROOT / "tmp/site-assets").iterdir()):
        files.append(File.generated(config, f"assets/{asset.name}", content=asset.read_bytes()))
    return files


def example_folders():
    return sorted(path for path in (ROOT / "examples").iterdir()
                  if path.is_dir() and re.match(r"^\d{2}-", path.name))


def example_panel(path, side):
    source = path.read_text()
    body = source.split("\n", 1)[1].strip()
    body = re.sub(r"^```mermaid\s*$", "```example-mermaid", body, flags=re.MULTILINE)
    body = re.sub(r"^(#{1,4}) ", r"##\1 ", body, flags=re.MULTILINE)
    return f'<section class="example-panel" markdown>\n\n## {side}\n\n{body}\n\n</section>'


def example_page(folder, previous, following):
    title = (folder / "diagram.md").read_text().splitlines()[0].removeprefix("# ")
    aspect = folder.name.split("--", 2)[2].replace("-", " ")
    links = ["[All examples](index.md)"]
    for label, name in (("Previous", previous), ("Next", following)):
        if name:
            links.append(f"[{label}]({name}.md)")
    downloads = []
    for side, file in (("before", "diagram.md"), ("after", "diagram-fixed.md")):
        downloads.append(f'[Download {side} Markdown](../assets/examples/{folder.name}/{file}.txt)'
                         f'{{ download="{file}" }}')
    return f"""---
hide:
  - toc
---

# {title}

{' · '.join(links)}

Demonstrates **{aspect}**.

{' · '.join(downloads)}

<div class="example-grid" markdown>

{example_panel(folder / 'diagram.md', 'Before')}

{example_panel(folder / 'diagram-fixed.md', 'After')}

</div>
"""


def add_examples(files, config):
    folders = example_folders()
    navigation = []
    for position, folder in enumerate(folders):
        title = (folder / "diagram.md").read_text().splitlines()[0].removeprefix("# ")
        path = f"examples/{folder.name}.md"
        navigation.append({title: path})
        previous = folders[position - 1].name if position else None
        following = folders[position + 1].name if position + 1 < len(folders) else None
        files.append(File.generated(config, path, content=example_page(folder, previous, following)))
        files.append(File.generated(config, f"examples/gallery/{folder.name}/index.html",
                                    content=redirect(f"../../{folder.name}/")))
        for name in ("diagram.md", "diagram-fixed.md"):
            files.append(File.generated(config, f"assets/examples/{folder.name}/{name}.txt",
                                        content=(folder / name).read_bytes()))
    files.append(File.generated(config, "examples/gallery/index.html", content=redirect("../")))
    files.append(File.generated(config, "examples/mermaid/index.html", content=redirect("../")))
    examples = next(section["Examples"] for section in config["nav"] if "Examples" in section)
    examples[:] = ["examples/index.md", {"Prose before and after": "examples/prose.md"}, *navigation]


def redirect(target):
    return (f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url={target}">'
            f'<title>Examples</title><a href="{target}">Open examples</a>')


def on_page_markdown(markdown, page, **kwargs):
    if page.file.src_uri != "examples/index.md":
        return markdown
    cards = ['<div class="grid cards" markdown>', ""]
    for folder in example_folders():
        title = (folder / "diagram.md").read_text().splitlines()[0].removeprefix("# ")
        family, _, aspect = folder.name.split("--", 2)
        cards.extend([f'- **[{title}]({folder.name}.md)**', "",
                      f'    {family.split("-", 1)[1]}: {aspect.replace("-", " ")}.', ""])
    cards.append('</div>')
    return markdown + "\n\n" + "\n".join(cards)
