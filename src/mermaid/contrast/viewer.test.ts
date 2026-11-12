import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { analyzeMermaid, MERMAID_RULES } from "../analyze.ts";
import { resolveViewer } from "./viewer.ts";

const LIGHT = {
  canvas: "#ffffff",
  text: "#36464e",
  edge: "#36464e",
  nodeFill: "#526cfe1a",
  accent: "#526cfe",
  clusterFill: "#00000012",
  accentText: "#ffffff",
};
const DARK = { ...LIGHT, canvas: "#1e2129", text: "#d5d8e2", edge: "#d5d8e2", clusterFill: "#e3e5ec1f" };

const material = (light: Record<string, string> = LIGHT, dark: Record<string, string> = DARK) => ({
  viewer: "mkdocs-material" as const,
  host: { light, dark },
});

const TEXT = { rules: [MERMAID_RULES.contrast] };
const CONNECTORS = { rules: [MERMAID_RULES.connectors] };

const fenced = (body: string, config: Record<string, unknown> = {}) =>
  `\`\`\`mermaid\n---\nconfig: ${JSON.stringify(config)}\n---\n${body}\n\`\`\``;

const names = (findings: { message: string }[]) => findings.map((finding) => finding.message.split(":")[0]);

test("the github viewer keeps the existing canvas defaults and rejects host colours", () => {
  assert.deepEqual(resolveViewer({}), { name: "github", canvas: { light: "#ffffff", dark: "#0d1117" } });
  assert.throws(() => resolveViewer({ host: { light: LIGHT, dark: DARK } }), /only to the mkdocs-material viewer/);
  assert.throws(() => resolveViewer({ viewer: "confluence" as never }), /not github or mkdocs-material/);
});

test("mkdocs-material requires every measured anchor in both modes", () => {
  assert.throws(() => resolveViewer({ viewer: "mkdocs-material" }), /needs host.light with measured canvas, text/);
  assert.throws(() => resolveViewer(material({ ...LIGHT, edge: undefined } as never)), /host.light is missing edge/);
  assert.throws(
    () => resolveViewer(material(LIGHT, { ...DARK, glow: "#fff" })),
    /host.dark.glow is not a known anchor/,
  );
  assert.throws(() => resolveViewer(material({ ...LIGHT, text: "inherit" })), /host.light.text is not a CSS colour/);
  assert.throws(() => resolveViewer(material({ ...LIGHT, canvas: "#ffffff80" })), /host.light.canvas is translucent/);
  assert.throws(() => resolveViewer({ ...material(), canvas: { light: "#fff" } }), /takes its canvas from host/);
  assert.deepEqual(resolveViewer(material()).canvas, { light: "#ffffff", dark: "#1e2129" });
});

test("host text beats authored theme variables, while inline styles beat the host", async () => {
  const pale = { ...LIGHT, text: "#dddddd" };
  const body = "flowchart LR\n  A --> B\n  style B fill:#ffffff,color:#000000";

  const findings = await analyzeMermaid(fenced(body, { themeVariables: { primaryTextColor: "#000000" } }), {
    ...TEXT,
    ...material(pale),
  });

  assert.deepEqual(names(findings), ["A"]);
  assert.match(findings[0]?.message ?? "", /text #dddddd .* in the light theme/);
});

test("a translucent host node fill is composited over the canvas before measuring", async () => {
  const findings = await analyzeMermaid(fenced("flowchart LR\n  A"), {
    ...TEXT,
    ...material({ ...LIGHT, nodeFill: "rgba(0, 0, 0, 0.5)", text: "#808080" }),
  });

  assert.deepEqual(names(findings), ["A"]);
  assert.match(findings[0]?.message ?? "", /on #808080 in the light theme \(1\.00:1/);
});

test("Material renders unstyled families with the default theme in its dark palette too", async () => {
  const pie = fenced('pie\n  title Orders\n  "Kept": 3');

  const github = await analyzeMermaid(pie, TEXT);

  const hosted = await analyzeMermaid(pie, { ...TEXT, ...material() });

  assert.ok(!github.some((finding) => finding.message.startsWith("diagram title")));
  assert.ok(hosted.some((finding) => /^diagram title: .* in the dark theme/.test(finding.message)));
});

test("Material repaints sequence groups and needs accentText only for numbered messages", async () => {
  const grouped = fenced(
    "sequenceDiagram\n  box rgb(0,0,0) Shop\n  participant A\n  participant B\n  end\n  A->>B: hi",
  );
  const numbered = fenced("sequenceDiagram\n  autonumber\n  A->>B: hi");
  const withoutBadgeText = material({ ...LIGHT, accentText: undefined } as never);

  assert.deepEqual(await analyzeMermaid(grouped, { ...TEXT, ...material() }), []);
  assert.deepEqual(names(await analyzeMermaid(numbered, { ...TEXT, ...withoutBadgeText })), [
    "Contrast cannot be audited for autonumber",
  ]);

  // Material's default badge, white on #526cfe, is itself below 4.5:1.
  assert.deepEqual(
    [...new Set(names(await analyzeMermaid(numbered, { ...TEXT, ...material() })))],
    ["sequenceNumberColor"],
  );
});

test("connectors take the host edge colour unless a link style sets one", async () => {
  const pale = { ...LIGHT, edge: "#eeeeee" };

  const findings = await analyzeMermaid(fenced("flowchart LR\n  A --> B\n  B --> C\n  linkStyle 1 stroke:#888888"), {
    ...CONNECTORS,
    ...material(pale),
  });

  assert.deepEqual([...new Set(names(findings))], ["edge A → B line", "edge A → B arrowhead"]);
});

test("the Material fixture fails only the sections that say so in both modes", async () => {
  const markdown = await readFile(new URL("../fixtures/mkdocs-material.md", import.meta.url), "utf8");
  const section = (offset: number) => [...markdown.slice(0, offset).matchAll(/^## (.+)$/gm)].at(-1)?.[1] ?? "";

  const findings = await analyzeMermaid(markdown, { ...material() });

  assert.deepEqual(
    [
      ...new Set(
        findings.map((finding) => `${section(finding.start)} | ${finding.message.match(/in the (\w+) theme/)?.[1]}`),
      ),
    ],
    [
      "Failing: sequence frame labels in the accent colour | light",
      "Failing: sequence frame labels in the accent colour | dark",
      "Failing: a light pie on the dark palette | dark",
    ],
  );
});
