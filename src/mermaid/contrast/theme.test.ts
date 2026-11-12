import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMermaid, MERMAID_RULES } from "../analyze.ts";
import { getMermaidCore } from "../parsing/engine.ts";
import { themeProblem } from "./theme.ts";

const WHITE = { light: "#ffffff", dark: "#ffffff" };

const pinned = (theme: string, body: string, themeVariables: Record<string, string> = {}) =>
  `\`\`\`mermaid\n---\nconfig: ${JSON.stringify({ theme, themeVariables })}\n---\n${body}\n\`\`\``;

// The theme names Mermaid 11.17.2 ships, read from its src/themes directory.
const ENGINE_THEMES = [
  "base",
  "dark",
  "default",
  "forest",
  "neutral",
  "neo",
  "neo-dark",
  "redux",
  "redux-dark",
  "redux-color",
  "redux-dark-color",
];

test("every theme the pinned engine ships is recognised, and unknown names are rejected", async () => {
  const mermaid = await getMermaidCore();

  for (const theme of ENGINE_THEMES) {
    assert.equal(themeProblem(mermaid, theme, "flowchart"), null, theme);
  }

  assert.equal(themeProblem(mermaid, undefined, "flowchart"), null);
  assert.equal(themeProblem(mermaid, "bogus", "flowchart"), "Mermaid does not define a bogus theme");
});

test("a theme a renderer branches on is unauditable for that family only", async () => {
  const mermaid = await getMermaidCore();

  assert.equal(
    themeProblem(mermaid, "redux-color", "erDiagram"),
    "erDiagram renders the redux-color theme with paint the audit does not model",
  );
  assert.equal(themeProblem(mermaid, "redux-color", "flowchart"), null);
  assert.equal(themeProblem(mermaid, "redux", "erDiagram"), null);
  assert.match(themeProblem(mermaid, "redux", "timeline") ?? "", /timeline renders the redux theme/);
});

test("checking a theme restores Mermaid's configuration whether or not it is defined", async () => {
  const mermaid = await getMermaidCore();
  const prior = JSON.stringify(mermaid.mermaidAPI.getSiteConfig());

  themeProblem(mermaid, "neo-dark", "flowchart");

  assert.equal(JSON.stringify(mermaid.mermaidAPI.getSiteConfig()), prior);

  themeProblem(mermaid, "bogus", "flowchart");

  assert.equal(JSON.stringify(mermaid.mermaidAPI.getSiteConfig()), prior);
});

test("a formerly rejected engine theme is scored from its variables and overrides in both modes", async () => {
  const source = pinned("neo", "flowchart LR\n  A --> B", { lineColor: "#eeeeee" });

  const connectors = await analyzeMermaid(source, { rules: [MERMAID_RULES.connectors], canvas: WHITE });

  const text = await analyzeMermaid(source, { rules: [MERMAID_RULES.contrast], canvas: WHITE });

  assert.deepEqual(
    connectors.map((finding) => finding.message.match(/in the (\w+) theme/)?.[1]),
    ["light", "light", "dark", "dark"],
  );
  assert.ok(connectors.every((finding) => finding.message.includes("stroke #eeeeee")));
  assert.ok(!text.some((finding) => /cannot be audited/.test(finding.message)), JSON.stringify(text));
});

test("unknown and branched themes report explicit unauditable errors", async () => {
  const unknown = await analyzeMermaid(pinned("bogus", "flowchart LR\n  A --> B"), {
    rules: [MERMAID_RULES.contrast],
  });

  const branched = await analyzeMermaid(pinned("redux-color", "erDiagram\n  A ||--o{ B : has"), {
    rules: [MERMAID_RULES.contrast],
  });

  assert.deepEqual(
    unknown.map((finding) => finding.message.split(". ")[0]),
    ["Contrast cannot be audited: Mermaid does not define a bogus theme"],
  );
  assert.match(branched[0]?.message ?? "", /erDiagram renders the redux-color theme/);
});
