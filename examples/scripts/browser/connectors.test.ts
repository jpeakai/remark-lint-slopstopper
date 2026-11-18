import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import Color from "colorjs.io";
import { type Browser, chromium, type Page } from "playwright";
import { analyzeSurfaces } from "../../../src/mermaid/contrast/analysis.ts";
import { GITHUB_CANVAS } from "../../../src/mermaid/contrast/theme.ts";
import { extractStats } from "../../../src/mermaid/parsing/statistics.ts";

// Each family's modelled Connector paint must equal what Mermaid 11.17.2
// actually paints in a browser, in both themes.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MERMAID = join(ROOT, "node_modules", "mermaid", "dist", "mermaid.min.js");
const executablePath = process.env.CHROME_PATH;

// Selectors for each family's connector elements; arrowheads are read from their markers.
const SELECTORS: Record<string, string> = {
  architecture: "path.edge, polygon.arrow",
  requirement: "path.relationshipLine",
  mindmap: "path.edge",
  eventmodeling: "path.em-relation",
  treeView: "line.treeView-node-line",
  c4: "line[marker-end], path[marker-end]",
  timeline: ".lineWrapper line",
  railroad: "path.railroad-line",
  ishikawa: "line.ishikawa-spine, line.ishikawa-branch, line.ishikawa-sub-branch",
  block: "path.flowchart-link",
};

const INLINE: Record<string, string> = {
  railroad: 'railroad-beta\nmain = sequence(terminal("x"), nonterminal("value"));',
  ishikawa: "ishikawa-beta\nEffect\n  Cause\n    Detail",
  block: "block-beta\n  columns 2\n  a b\n  a --> b",
};

const EXAMPLES: Record<string, string> = {
  architecture: "13-",
  eventmodeling: "16-",
  mindmap: "20-",
  requirement: "23-",
  c4: "15-",
  timeline: "26-",
  treeView: "28-",
};

let browser: Browser;
let page: Page;

before(async () => {
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  page = await browser.newPage();
  await page.setContent("<!doctype html><body><div id=s></div></body>");
  await page.addScriptTag({ path: MERMAID });
});

after(async () => {
  await browser?.close();
});

const hex = (value: string) => new Color(value).to("srgb").toString({ format: "hex", collapse: false });

async function source(family: string): Promise<string> {
  const inline = INLINE[family];

  if (inline) {
    return inline;
  }

  const prefix = EXAMPLES[family] ?? "";
  const name = (await readdir(join(ROOT, "examples"))).find((item) => item.startsWith(prefix)) ?? prefix;
  const markdown = await readFile(join(ROOT, "examples", name, "diagram.md"), "utf8");

  return markdown.match(/```mermaid\n([\s\S]*?)```/)?.[1] ?? "";
}

// The distinct stroke and arrowhead fill colours the browser paints.
async function painted(diagram: string, theme: string, selector: string): Promise<string[]> {
  const colours = await page.evaluate(
    async ({ diagram, theme, selector }) => {
      const runtime = (
        globalThis as unknown as {
          mermaid: { initialize(c: object): void; render(id: string, s: string): Promise<{ svg: string }> };
        }
      ).mermaid;

      runtime.initialize({ startOnLoad: false, theme });

      const { svg } = await runtime.render(`k${Math.random().toString(36).slice(2)}`, diagram);
      const stage = document.getElementById("s") as HTMLElement;

      stage.innerHTML = svg;

      const elements = [...stage.querySelectorAll(selector)];
      const strokes = elements.map((element) =>
        element.tagName === "polygon" ? getComputedStyle(element).fill : getComputedStyle(element).stroke,
      );
      const heads = elements
        .map((element) => (element.getAttribute("marker-end") ?? "").match(/#([^)]+)/)?.[1])
        .map((id) => (id ? stage.querySelector(`[id="${id}"] path, [id="${id}"] polygon`) : null))
        .filter((head) => head !== null)
        .map((head) => getComputedStyle(head).fill);

      return [...strokes, ...heads];
    },
    { diagram, theme, selector },
  );

  return [...new Set(colours.map(hex))].sort();
}

const channels = (value: string) => (new Color(value).to("srgb").coords as number[]).map((c) => Math.round(c * 255));

// Browsers quantise hsl() to 8-bit channels, so colours match within one unit.
function sameColours(model: string[], browser: string[], label: string): void {
  const close = (a: string, b: string) =>
    channels(a).every((value, index) => Math.abs(value - (channels(b)[index] ?? 0)) <= 1);
  const both = `${label}: ${model.join(", ")} vs ${browser.join(", ")}`;

  assert.equal(model.length, browser.length, both);
  assert.ok(
    model.every((colour) => browser.some((painted) => close(colour, painted))),
    both,
  );
}

async function modelled(diagram: string, theme: "light" | "dark"): Promise<string[]> {
  const analysis = await analyzeSurfaces(diagram, await extractStats(diagram), {
    name: "github",
    canvas: GITHUB_CANVAS,
  });
  const colours = analysis.surfaces
    .filter((surface) => surface.kind === "connector" && surface.theme === theme)
    .map((surface) => hex(surface.foreground));

  assert.deepEqual(analysis.unsupported, [], "the family is fully modelled");

  return [...new Set(colours)].sort();
}

for (const family of Object.keys(SELECTORS)) {
  test(`${family} connectors match browser paint in both themes`, async () => {
    const diagram = await source(family);

    for (const [theme, mermaidTheme] of [
      ["light", "default"],
      ["dark", "dark"],
    ] as const) {
      sameColours(
        await modelled(diagram, theme),
        await painted(diagram, mermaidTheme, SELECTORS[family] ?? ""),
        `${family} ${theme}`,
      );
    }
  });
}
