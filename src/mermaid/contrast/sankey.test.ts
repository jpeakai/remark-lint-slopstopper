import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMermaid, MERMAID_RULES } from "../analyze.ts";
import { RIBBON_OVERLAP_LIMIT, SANKEY_RECIPE } from "./surfaces/sankey.ts";

const TEXT = { rules: [MERMAID_RULES.contrast] };
const COLOURS = { A: "#1d4ed8", B: "#047857", C: "#b91c1c", D: "#7c3aed", E: "#a16207", F: "#0e7490" };
const sankey = (body: string, config: Record<string, unknown>) =>
  `\`\`\`mermaid\n---\nconfig: ${JSON.stringify(config)}\n---\nsankey-beta\n\n${body}\n\`\`\``;
const recipe = (extra: Record<string, unknown> = {}, variables: Record<string, string> = {}) => ({
  themeCSS: SANKEY_RECIPE,
  themeVariables: variables,
  sankey: { linkColor: "source", nodeColors: COLOURS, ...extra },
});
const unauditable = async (body: string, config: Record<string, unknown>) =>
  (await analyzeMermaid(sankey(body, config), TEXT))
    .filter((finding) => finding.message.startsWith("Contrast cannot be audited"))
    .map((finding) => finding.message);

test("native multiply-blended ribbons are unauditable and name the recipe", async () => {
  const [message] = await unauditable("A,B,10", {});

  assert.match(message ?? "", /multiply-blend over the labels/);
  assert.ok(message?.includes(SANKEY_RECIPE));
});

test("the recipe is accepted ignoring comments, spacing and declaration order", async () => {
  for (const css of [SANKEY_RECIPE, "/* ribbons */ .link{stroke-opacity:0.16;mix-blend-mode:normal !important}"]) {
    assert.deepEqual(await unauditable("A,B,10", { ...recipe(), themeCSS: css }), [], css);
  }
});

test("every mutation of the recipe is rejected", async () => {
  for (const css of [
    SANKEY_RECIPE.replace("0.16", "0.3"),
    SANKEY_RECIPE.replace(" !important", ""),
    `${SANKEY_RECIPE} text { fill: red; }`,
    SANKEY_RECIPE.replace(".link", ".node"),
  ]) {
    const [message] = await unauditable("A,B,10", { ...recipe(), themeCSS: css });

    assert.match(message ?? "", /Sankey themeCSS must be exactly/, css);
  }
});

test("ribbon paint must be one opaque colour per ribbon", async () => {
  const cases: [Record<string, unknown>, RegExp][] = [
    [{ linkColor: "gradient" }, /gradient Sankey ribbons are not modeled/],
    [{ linkColor: "target", nodeColors: { A: "#1d4ed8" } }, /sankey\.nodeColors\.B is missing/],
    [{ linkColor: "target", nodeColors: { ...COLOURS, B: "#04785780" } }, /nodeColors\.B #04785780 must be an opaque/],
    [{ linkColor: "nonsense" }, /sankey\.linkColor nonsense is not a CSS colour/],
  ];

  for (const [extra, reason] of cases) {
    const [message] = await unauditable("A,B,10", recipe(extra));

    assert.match(message ?? "", reason, JSON.stringify(extra));
  }

  assert.deepEqual(await unauditable("A,B,10", recipe({ linkColor: "#334155" })), []);
});

test("unsupported flows are rejected with their reason", async () => {
  assert.match((await unauditable("A,B,0", recipe()))[0] ?? "", /flow value 0 is not positive/);
  assert.match((await unauditable("A,B,10\nB,A,5", recipe()))[0] ?? "", /circular flows are not modeled/);
});

test("labels are measured under every combination of the ribbons over them", async () => {
  const findings = await analyzeMermaid(sankey("A,B,10\nA,C,10", recipe({}, { textColor: "#767676" })), TEXT);

  assert.ok(
    findings.some((finding) => / under A → [BC]/.test(finding.message)),
    JSON.stringify(findings),
  );
  assert.ok(findings.every((finding) => !finding.message.startsWith("Contrast cannot be audited")));
});

test("a readable recipe diagram passes in both themes", async () => {
  assert.deepEqual(
    await analyzeMermaid(
      sankey("A,B,10\nA,C,5\nB,D,5", recipe({ labelStyle: "outlined" }, { textColor: "#000", mainBkg: "#fff" })),
      TEXT,
    ),
    [],
  );
});

test(`a label under more than ${RIBBON_OVERLAP_LIMIT} ribbons is unauditable`, async () => {
  const flows = ["B", "C", "D", "E", "F"].map((target) => `A,${target},1`).join("\n");

  const [message] = await unauditable(flows, recipe({ nodePadding: 0, height: 40 }));

  assert.match(message ?? "", /label A lies under 5 ribbons/);
});
