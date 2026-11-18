import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import Color from "colorjs.io";
import { type Browser, chromium, type Page } from "playwright";
import { analyzeSurfaces } from "../../../src/mermaid/contrast/analysis.ts";
import { GITHUB_CANVAS } from "../../../src/mermaid/contrast/theme.ts";
import { extractStats } from "../../../src/mermaid/parsing/statistics.ts";

// Radar axis labels must be measured in the paint the browser gives them:
// Mermaid's CSS sets their `color`, which SVG text ignores, so the glyphs
// inherit the root fill in textColor.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MERMAID = join(ROOT, "node_modules", "mermaid", "dist", "mermaid.min.js");
const executablePath = process.env.CHROME_PATH;
const BODY = 'radar-beta\n  axis speed["Speed"], cost["Cost"], reach["Reach"]\n  curve now["Now"]{3,4,3}';

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

async function axisFills(source: string, theme: string): Promise<string[]> {
  return page.evaluate(
    async ({ source, theme }) => {
      const runtime = (
        globalThis as unknown as {
          mermaid: { initialize(c: object): void; render(i: string, s: string): Promise<{ svg: string }> };
        }
      ).mermaid;

      runtime.initialize({ startOnLoad: false, theme });

      const { svg } = await runtime.render(`r${Math.random().toString(36).slice(2)}`, source);
      const stage = document.getElementById("s") as HTMLElement;

      stage.innerHTML = svg;

      return [...stage.querySelectorAll(".radarAxisLabel")].map((label) => getComputedStyle(label).fill);
    },
    { source, theme },
  );
}

for (const variables of [{}, { radar: { axisColor: "#ff0000" } }, { textColor: "#0f766e" }]) {
  test(`radar axis labels paint in the modelled colour with ${JSON.stringify(variables)}`, async () => {
    const source = `---\nconfig: ${JSON.stringify({ themeVariables: variables })}\n---\n${BODY}`;
    const analysis = await analyzeSurfaces(source, await extractStats(source), {
      name: "github",
      canvas: GITHUB_CANVAS,
    });

    assert.deepEqual(analysis.unsupported, []);

    for (const [mode, theme] of [
      ["light", "default"],
      ["dark", "dark"],
    ] as const) {
      const modelled = analysis.surfaces.filter(
        (surface) => surface.theme === mode && surface.name.startsWith("axis "),
      );
      const painted = await axisFills(source, theme);

      assert.equal(painted.length, 3);
      assert.deepEqual(
        modelled.map((surface) => hex(surface.foreground)),
        painted.map(hex),
        `${theme} theme`,
      );
    }
  });
}
