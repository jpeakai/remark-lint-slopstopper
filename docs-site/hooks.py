"""Expose canonical repository documents without maintaining a second copy."""

from pathlib import Path
from collections import defaultdict
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
    links = ["[All diagrams](index.md)"]
    for label, name in (("Previous", previous), ("Next", following)):
        if name:
            links.append(f"[{label}]({name}.md)")
    downloads = []
    for side, file in (("before", "diagram.md"), ("after", "diagram-fixed.md")):
        downloads.append(f'[Download {side} Markdown](../../assets/examples/{folder.name}/{file}.txt)'
                         f'{{ download="{file}" }}')
    return f"""# {title}

{' · '.join(links)}

Demonstrates **{aspect}**.
The original deliberately exercises lint findings. The comparison is a manual revision for review.
Rendering uses Mermaid 12.2.0, separately from the package's analysis engine.

{' · '.join(downloads)}

<div class="example-grid" markdown>

{example_panel(folder / 'diagram.md', 'Before')}

{example_panel(folder / 'diagram-fixed.md', 'After')}

</div>
"""


def add_examples(files, config):
    groups = defaultdict(list)
    folders = example_folders()
    index = ["# Diagram gallery", "",
             "Compare original and revised diagrams by family. Open a diagram to zoom, or expand its source.", "",
             "The original fixtures intentionally include failures. Rendering errors remain visible beside their source.", "",
             "Use **jpai-essentials:mermaidjs-diagrams** from **jpeakai/skills** for repair and styling guidance.", "",
             "The [example guide](../README.md) describes the files and repair workflow.", ""]
    for position, folder in enumerate(folders):
        family = folder.name.split("--")[0].split("-", 1)[1]
        title = (folder / "diagram.md").read_text().splitlines()[0].removeprefix("# ")
        path = f"examples/gallery/{folder.name}.md"
        groups[family].append({title: path})
        previous = folders[position - 1].name if position else None
        following = folders[position + 1].name if position + 1 < len(folders) else None
        files.append(File.generated(config, path, content=example_page(folder, previous, following)))
        for name in ("diagram.md", "diagram-fixed.md"):
            files.append(File.generated(config, f"assets/examples/{folder.name}/{name}.txt",
                                        content=(folder / name).read_bytes()))
    for family, entries in groups.items():
        index.extend([f"## {family}", ""])
        for entry in entries:
            title, path = next(iter(entry.items()))
            index.append(f"- [{title}]({Path(path).name})")
        index.append("")
    files.append(File.generated(config, "examples/gallery/index.md", content="\n".join(index)))
    files.append(File.generated(config, "examples/README.md",
                                content=source_links((ROOT / "examples/README.md").read_text(), "examples/README.md", set())))
    examples = next(section["Examples"] for section in config["nav"] if "Examples" in section)
    examples[:] = [section for section in examples if not isinstance(section, dict) or "Diagram gallery" not in section]
    examples.append({"Diagram gallery": ["examples/gallery/index.md",
                                        *({family: entries} for family, entries in groups.items())]})
