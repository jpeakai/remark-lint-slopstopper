import assert from "node:assert/strict";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { diagramFromText } from "../../../src/mermaid/compat/api.ts";
import {
  type Box,
  readSankeyGraph,
  SANKEY_RECIPE,
  sankeyConfig,
  sankeyGeometry,
} from "../../../src/mermaid/contrast/surfaces/sankey.ts";
import { getMermaidCore } from "../../../src/mermaid/parsing/engine.ts";

// The Sankey model must bound what Mermaid 11.17.2 actually draws: node
// positions exactly, label and ribbon extents conservatively, and the paint
// of the documented recipe, in both themes and both label styles.

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MERMAID = join(ROOT, "node_modules", "mermaid", "dist", "mermaid.min.js");
const executablePath = process.env.CHROME_PATH;
const COLOURS = { Placed: "#1d4ed8", Paid: "#047857", Declined: "#b91c1c", Shipped: "#7c3aed", Cancelled: "#a16207" };
const BODY = "sankey-beta\n\nPlaced,Paid,90\nPlaced,Declined,10\nPaid,Shipped,80\nPaid,Cancelled,10";

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

interface Drawn {
  nodes: Record<string, Box>;
  labels: Record<string, Box>;
  ribbons: Box[];
  paint: { text: string[]; ribbons: string[]; outline: string[] };
}

async function drawn(source: string, theme: string): Promise<Drawn> {
  return page.evaluate(
    async ({ source, theme }) => {
      const runtime = (
        globalThis as unknown as {
          mermaid: { initialize(c: object): void; render(i: string, s: string): Promise<{ svg: string }> };
        }
      ).mermaid;

      runtime.initialize({ startOnLoad: false, theme });

      const { svg } = await runtime.render(`k${Math.random().toString(36).slice(2)}`, source);
      const stage = document.getElementById("s") as HTMLElement;

      stage.innerHTML = svg;

      const box = (b: DOMRect, grow = 0) => ({
        left: b.x,
        right: b.x + b.width,
        top: b.y - grow,
        bottom: b.y + b.height + grow,
      });
      const nodes = Object.fromEntries(
        [...stage.querySelectorAll("g.node")].map((group, index) => {
          const [x = 0, y = 0] = (group.getAttribute("transform")?.match(/[-\d.]+/g) ?? []).map(Number);
          const rect = group.querySelector("rect") as SVGRectElement;
          const label = stage.querySelectorAll(".node-labels text")[index]?.textContent ?? String(index);

          return [
            label.split(/\s/)[0],
            { left: x, right: x + rect.width.baseVal.value, top: y, bottom: y + rect.height.baseVal.value },
          ];
        }),
      );
      const labels = Object.fromEntries(
        [...stage.querySelectorAll(".node-labels text")].map((text) => [
          text.textContent?.split(/\s/)[0] ?? "",
          box((text as SVGGraphicsElement).getBBox()),
        ]),
      );
      const ribbons = [...stage.querySelectorAll("g.link path")].map((path) =>
        box((path as SVGGraphicsElement).getBBox(), Number.parseFloat(getComputedStyle(path).strokeWidth) / 2),
      );
      const styles = (selector: string, read: (style: CSSStyleDeclaration) => string) =>
        [...new Set([...stage.querySelectorAll(selector)].map((element) => read(getComputedStyle(element))))].sort();

      return {
        nodes,
        labels,
        ribbons,
        paint: {
          text: styles(".node-labels text:not(.sankey-label-bg)", (s) => s.fill),
          ribbons: [
            ...new Set(
              [...stage.querySelectorAll("g.link")].map((link) => {
                const path = getComputedStyle(link.querySelector("path") as Element);

                return `${path.stroke}|${path.strokeOpacity}|${getComputedStyle(link).mixBlendMode}`;
              }),
            ),
          ].sort(),
          outline: styles(".sankey-label-bg", (s) => `${s.stroke}|${s.strokeWidth}|${s.paintOrder}`),
        },
      };
    },
    { source, theme },
  );
}

const within = (inner: Box, outer: Box) =>
  inner.left >= outer.left - 0.5 &&
  inner.right <= outer.right + 0.5 &&
  inner.top >= outer.top - 0.5 &&
  inner.bottom <= outer.bottom + 0.5;
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

type Model = ReturnType<typeof sankeyGeometry>;

function assertNodes(model: Model, real: Drawn): void {
  for (const node of model.nodes) {
    const box = real.nodes[node.id];

    assert.ok(box, node.id);
    assert.deepEqual(
      [box.left, box.right, box.top, box.bottom].map((v) => Math.round(v * 10) / 10),
      [node.x0, node.x1, node.y0, node.y1].map((v) => Math.round(v * 10) / 10),
      `${node.id} position`,
    );
    assert.ok(within(real.labels[node.id] as Box, model.labels.get(node.id) as Box), `${node.id} label bounds`);
  }
}

// Every ribbon stays inside its modelled box, and every drawn overlap with a
// label is one the model also measures.
function assertRibbons(model: Model, real: Drawn): void {
  for (const [index, ribbon] of model.ribbons.entries()) {
    const drawnRibbon = real.ribbons[index] as Box;

    assert.ok(within(drawnRibbon, ribbon.box), `${ribbon.name} ribbon bounds`);

    for (const [id] of Object.entries(real.labels).filter(([, label]) => overlaps(drawnRibbon, label))) {
      assert.ok(overlaps(ribbon.box, model.labels.get(id) as Box), `${ribbon.name} over ${id} is modelled`);
    }
  }
}

for (const labelStyle of ["legacy", "outlined"]) {
  test(`${labelStyle} Sankey geometry and paint are bounded by the model in both themes`, async () => {
    const config = { themeCSS: SANKEY_RECIPE, sankey: { linkColor: "source", nodeColors: COLOURS, labelStyle } };
    const source = `---\nconfig: ${JSON.stringify(config)}\n---\n${BODY}`;
    const diagram = await diagramFromText(await getMermaidCore(), source);
    const model = sankeyGeometry(readSankeyGraph(diagram.db), await sankeyConfig(config as never));

    for (const theme of ["default", "dark"]) {
      const real = await drawn(source, theme);

      assertNodes(model, real);
      assertRibbons(model, real);
      assert.deepEqual(real.paint.text, [theme === "dark" ? "rgb(204, 204, 204)" : "rgb(51, 51, 51)"]);
      assert.ok(
        real.paint.ribbons.every((paint) => /\|0\.16\|normal$/.test(paint)),
        JSON.stringify(real.paint.ribbons),
      );
      assert.equal(real.paint.outline.length, labelStyle === "outlined" ? 1 : 0);
    }
  });
}
