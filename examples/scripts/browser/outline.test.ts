import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import Color from "colorjs.io";
import { type Browser, chromium, type Page } from "playwright";
import { analyzeSurfaces } from "../../../src/mermaid/contrast/analysis.ts";
import { OUTLINE_SELECTORS } from "../../../src/mermaid/contrast/outline.ts";
import { GITHUB_CANVAS } from "../../../src/mermaid/contrast/theme.ts";
import { extractStats } from "../../../src/mermaid/parsing/statistics.ts";

// The text outline recipe must paint in a browser exactly as the audit models
// it: an opaque white, round-joined 3px stroke drawn before each glyph.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MERMAID = join(ROOT, "node_modules", "mermaid", "dist", "mermaid.min.js");
const executablePath = process.env.CHROME_PATH;
const CSS = (selector: string) =>
  `${selector} { paint-order: stroke; stroke: #ffffff; stroke-width: 3px; stroke-linejoin: round; }`;
const BODIES: Record<string, string> = {
  treeView: "treeView-beta\nroot\n  child",
  c4: 'C4Context\n  System(a, "A")\n  System(b, "B")\n  Rel(a, b, "uses")',
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

interface Paint {
  fills: string[];
  outlines: string[];
}

async function painted(source: string, theme: string, selector: string): Promise<Paint> {
  const paint = await page.evaluate(
    async ({ source, theme, selector }) => {
      const runtime = (
        globalThis as unknown as {
          mermaid: { initialize(c: object): void; render(i: string, s: string): Promise<{ svg: string }> };
        }
      ).mermaid;

      runtime.initialize({ startOnLoad: false, theme });

      const { svg } = await runtime.render(`o${Math.random().toString(36).slice(2)}`, source);
      const stage = document.getElementById("s") as HTMLElement;

      stage.innerHTML = svg;

      const styles = [...stage.querySelectorAll(selector)].map((element) => getComputedStyle(element));

      return {
        fills: styles.map((style) => style.fill),
        outlines: styles.map(
          (style) => `${style.paintOrder}|${style.stroke}|${style.strokeWidth}|${style.strokeLinejoin}`,
        ),
      };
    },
    { source, theme, selector },
  );

  return { fills: [...new Set(paint.fills.map(hex))].sort(), outlines: [...new Set(paint.outlines)] };
}

for (const [family, body] of Object.entries(BODIES)) {
  test(`${family} text outlines paint as modelled in both themes`, async () => {
    const selector = OUTLINE_SELECTORS[family] ?? "";
    const source = `---\nconfig:\n  themeCSS: ${JSON.stringify(CSS(selector))}\n---\n${body}`;
    const analysis = await analyzeSurfaces(source, await extractStats(source), {
      name: "github",
      canvas: GITHUB_CANVAS,
    });

    assert.deepEqual(analysis.unsupported, []);

    for (const [theme, mermaidTheme] of [
      ["light", "default"],
      ["dark", "dark"],
    ] as const) {
      const browserPaint = await painted(source, mermaidTheme, selector);
      const outlined = analysis.surfaces.filter(
        (s) => s.theme === theme && s.kind !== "connector" && s.background === "#ffffff",
      );

      assert.deepEqual(browserPaint.outlines, ["stroke|rgb(255, 255, 255)|3px|round"], `${family} ${theme}`);
      assert.deepEqual(
        [...new Set(outlined.map((s) => hex(s.foreground)))].sort(),
        browserPaint.fills,
        `${family} ${theme}`,
      );
    }
  });
}
