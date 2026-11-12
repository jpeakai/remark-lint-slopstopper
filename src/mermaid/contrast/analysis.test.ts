import assert from "node:assert/strict";
import { test } from "node:test";
import { getMermaidCore } from "../parsing/engine.ts";
import { extractStats } from "../parsing/statistics.ts";
import { analyzeSurfaces } from "./analysis.ts";
import { GITHUB_CANVAS } from "./theme.ts";

const analyze = async (source: string) => analyzeSurfaces(source, await extractStats(source), GITHUB_CANVAS);

test("surfaces expose kind, theme, colours and the authored source line", async () => {
  const source = "---\ntitle: Orders\n---\nflowchart TD\n  A[Api] --> B[Db]\n  style A fill:#000000,color:#ffffff";

  const analysis = await analyze(source);

  assert.deepEqual(analysis.unsupported, []);
  assert.deepEqual(
    analysis.surfaces.filter((surface) => surface.name === "A"),
    ["light", "dark"].map((theme) => ({
      kind: "label",
      name: "A",
      theme,
      foreground: "#ffffff",
      background: "#000000",
      line: 6,
    })),
  );
  assert.deepEqual(
    analysis.surfaces.filter((surface) => surface.kind === "title").map(({ theme, background }) => [theme, background]),
    [
      ["light", GITHUB_CANVAS.light],
      ["dark", GITHUB_CANVAS.dark],
    ],
  );
});

test("diagram-wide unsupported styling is explicit and yields no surfaces", async () => {
  const source = "---\nconfig:\n  themeCSS: '.node { fill: red }'\n---\nflowchart TD\n  A";

  const analysis = await analyze(source);

  assert.deepEqual(analysis, { surfaces: [], unsupported: [{ reason: "custom themeCSS is not modeled" }] });
});

test("declaration-level unsupported styling carries its selector and line", async () => {
  const source =
    "sequenceDiagram\n  participant A\n  participant C\n  box Aqua Shop\n  participant B\n  participant A\n  end\n  A->>B: hi";

  const analysis = await analyze(source);

  assert.deepEqual(analysis.unsupported, [
    {
      reason: "participant group Shop has members declared apart, so its painted extent cannot be measured",
      selector: "box",
      line: 1,
    },
  ]);
  assert.ok(analysis.surfaces.some((surface) => surface.name === "actorTextColor" && surface.theme === "dark"));
});

test("a failure after theme resolution restores Mermaid's site configuration", async () => {
  const mermaid = await getMermaidCore();
  const prior = JSON.stringify(mermaid.mermaidAPI.getSiteConfig());
  const source = [
    "---",
    "config:",
    "  theme: dark",
    "  themeVariables:",
    "    primaryColor: '#123456'",
    "---",
    "flowchart TD",
    "  A[\"<span style='color:red'>x</span>\"]",
  ].join("\n");

  const analysis = await analyze(source);

  assert.deepEqual(analysis.unsupported, [{ reason: "inline HTML label styles are not modeled" }]);
  assert.equal(JSON.stringify(mermaid.mermaidAPI.getSiteConfig()), prior);
});
