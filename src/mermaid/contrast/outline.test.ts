import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMermaid, MERMAID_RULES } from "../analyze.ts";
import { textOutline } from "./outline.ts";

const TEXT = { rules: [MERMAID_RULES.contrast] };
const RECIPE = "paint-order: stroke; stroke: #ffffff; stroke-width: 3px; stroke-linejoin: round;";
const tree = (css?: string) =>
  `\`\`\`mermaid\n${css === undefined ? "" : `---\nconfig:\n  themeCSS: ${JSON.stringify(css)}\n---\n`}treeView-beta\nroot\n  child\n\`\`\``;
const messages = (findings: { message: string }[]) => findings.map((finding) => finding.message.split(":")[0]);

test("the exact recipe is accepted, ignoring comments, spacing and declaration order", () => {
  assert.equal(textOutline(`.treeView-node-label { ${RECIPE} }`, "treeView", {}), "#ffffff");
  assert.equal(
    textOutline(
      "/* backing */ .treeView-node-label{stroke-linejoin:round;stroke-width:3px;stroke:#ffffff;paint-order:stroke}",
      "treeView",
      {},
    ),
    "#ffffff",
  );
  assert.equal(textOutline(`text { ${RECIPE} }`, "c4", {}), "#ffffff");
});

test("every mutation of the recipe is rejected with its reason", () => {
  const cases: [string, string, RegExp][] = [
    [`.treeView-node-label { ${RECIPE} fill: red; }`, "treeView", /declarations fill are not part/],
    [`text { ${RECIPE} }`, "treeView", /selector "text" is not the native treeView text selector/],
    [
      `.treeView-node-label { ${RECIPE.replace("#ffffff", "#eeeeee")} }`,
      "treeView",
      /stroke: #eeeeee is unsupported paint/,
    ],
    [`.treeView-node-label { ${RECIPE.replace("3px", "2px")} }`, "treeView", /stroke-width: 2px is unsupported paint/],
    [
      `.treeView-node-label { ${RECIPE.replace("paint-order: stroke;", "")} }`,
      "treeView",
      /needs exactly one paint-order/,
    ],
    [`.treeView-node-label { ${RECIPE} stroke: #ffffff; }`, "treeView", /needs exactly one stroke: #ffffff/],
    [`.treeView-node-label { ${RECIPE} } .x { fill: red; }`, "treeView", /must be exactly one rule/],
    [`text { ${RECIPE} }`, "flowchart", /: custom themeCSS is not modeled$/],
  ];

  for (const [css, kind, reason] of cases) {
    assert.throws(() => textOutline(css, kind, {}), reason, css);
  }

  assert.throws(
    () => textOutline(`text { ${RECIPE} }`, "c4", { c4: { textPlacement: "fo" } as never }),
    /C4 HTML text/,
  );
});

test("an outline gives native labels a measurable white backing in both themes", async () => {
  assert.deepEqual(messages(await analyzeMermaid(tree(), TEXT)), ["/", "root", "child"]);
  assert.deepEqual(await analyzeMermaid(tree(`.treeView-node-label { ${RECIPE} }`), TEXT), []);
});

test("an outlined glyph that matches its outline still fails", async () => {
  const pale = `---\nconfig:\n  themeVariables:\n    treeView:\n      labelColor: "#eeeeee"\n  themeCSS: ${JSON.stringify(`.treeView-node-label { ${RECIPE} }`)}\n---\n`;

  const findings = await analyzeMermaid(`\`\`\`mermaid\n${pale}treeView-beta\nroot\n  child\n\`\`\``, TEXT);

  assert.ok(findings.length > 0);
  assert.ok(findings.every((finding) => finding.message.includes("on #ffffff")));
});

test("a C4 title inherits the root text paint, not the theme's title colour", async () => {
  const source = (variables: Record<string, string>) =>
    `\`\`\`mermaid\n---\ntitle: Context\nconfig:\n  themeVariables: ${JSON.stringify(variables)}\n---\nC4Context\n  System(a, "A")\n\`\`\``;

  const pale = await analyzeMermaid(source({ textColor: "#eeeeee", titleColor: "#000000" }), TEXT);

  const dark = await analyzeMermaid(source({ textColor: "#000000", titleColor: "#eeeeee" }), TEXT);

  assert.ok(pale.some((finding) => /^diagram title: text #eeeeee .* light theme/.test(finding.message)));
  assert.ok(!dark.some((finding) => /^diagram title: .* light theme/.test(finding.message)));
});
