import assert from "node:assert/strict";
import { test } from "node:test";
import type { MermaidConfig } from "mermaid";
import { analyzeMermaid, MERMAID_RULES } from "../analyze.ts";

type FamilyFixture = [
  string,
  string,
  NonNullable<MermaidConfig["themeVariables"]>,
  MermaidConfig?,
];
const fixtures: FamilyFixture[] = [
  [
    "pie",
    'pie\n"A": 1',
    { pieSectionTextColor: "#fff", pie1: "#fff", pieOpacity: 1 },
  ],
  [
    "mindmap",
    "mindmap\nRoot\n  Child",
    { gitBranchLabel0: "#fff", git0: "#fff" },
  ],
  [
    "gantt",
    "gantt\ndateFormat YYYY-MM-DD\nsection S\nTask: 2026-01-01, 1d",
    { taskTextColor: "#fff", taskBkgColor: "#fff" },
  ],
  [
    "gitGraph",
    'gitGraph\ncommit id: "a" tag: "v1"',
    { gitBranchLabel0: "#fff", git0: "#fff" },
  ],
  [
    "packet",
    'packet-beta\n0-15: "Source"',
    { packet: { labelColor: "#fff", blockFillColor: "#fff" } },
  ],
  [
    "treemap",
    'treemap-beta\n"Root"\n  "Leaf": 10',
    { treemap: { labelColor: "#fff", leafFillColor: "#fff" } },
  ],
  [
    "sankey",
    "sankey-beta\n\nA,B,10\nB,C,5",
    { textColor: "#fff", mainBkg: "#fff" },
  ],
  [
    "kanban",
    "kanban\ntodo[Todo]\n  task[Task]",
    { textColor: "#fff", background: "#fff" },
  ],
  [
    "xychart",
    "xychart-beta\nx-axis [a,b,c]\nbar [1,2,3]",
    { xyChart: { xAxisLabelColor: "#fff", backgroundColor: "#fff" } },
  ],
  [
    "radar",
    "radar-beta\naxis a,b,c\ncurve one{1,2,3}",
    { radar: { axisColor: "#fff" } },
  ],
  [
    "quadrantChart",
    "quadrantChart\nquadrant-1 A\nP: [0.3,0.6]",
    { quadrant1TextFill: "#fff", quadrant1Fill: "#fff" },
  ],
  [
    "requirement",
    "requirementDiagram\nrequirement r {\nid: 1\ntext: t\nrisk: low\nverifymethod: test\n}",
    { requirementTextColor: "#fff", requirementBackground: "#fff" },
  ],
  ["journey", "journey\nsection S\nTask: 5: Actor", { textColor: "#fff" }],
  [
    "timeline",
    "timeline\nsection S\n2002: A: B",
    { cScaleLabel1: "#fff", cScale1: "#fff" },
  ],
  [
    "block",
    "block-beta\ncolumns 2\na b\na-->b",
    { textColor: "#fff", mainBkg: "#fff" },
  ],
  [
    "architecture",
    "architecture-beta\nservice api(server)[API]",
    { textColor: "#fff" },
  ],
  [
    "c4",
    'C4Context\nPerson(u,"User")\nSystem(s,"System")\nRel(u,s,"Uses")',
    {},
    { c4: { person_bg_color: "#fff" } },
  ],
  [
    "treeView",
    "treeView-beta\nroot\n  child",
    { treeView: { labelColor: "#fff" } },
  ],
  [
    "wardley",
    "wardley-beta\ncomponent A [0.5, 0.5]",
    { wardley: { componentLabelColor: "#fff", backgroundColor: "#fff" } },
  ],
  [
    "ishikawa",
    "ishikawa-beta\nEffect\n  Cause",
    { textColor: "#fff", mainBkg: "#fff" },
  ],
];
for (const [family, body, themeVariables, settings = {}] of fixtures) {
  test(`${family} actual parser model and configured text surfaces`, async () => {
    const config = { ...settings, themeVariables };
    const source =
      "```mermaid\n---\nconfig: " +
      JSON.stringify(config) +
      "\n---\n" +
      body +
      "\n```";
    const found = await analyzeMermaid(source);
    assert(
      !found.some((d) => /cannot be audited|cannot parse/.test(d.message)),
      JSON.stringify(found),
    );
    assert(
      found.some((d) => d.ruleId === MERMAID_RULES.contrast),
      `${family} did not detect deliberately unreadable text`,
    );
  });
}

test("Venn region text resolves overlapping translucent set fills", async () => {
  const source =
    '```mermaid\n---\nconfig:\n  themeVariables:\n    vennSetTextColor: "#ffffff"\n    venn1: "#ffffff"\n    venn2: "#ffffff"\n---\nvenn-beta\nset A: 10\nset B: 20\nunion A,B: 5\n```';
  const found = await analyzeMermaid(source);
  assert(
    !found.some((d) => /cannot be audited|cannot parse/.test(d.message)),
    JSON.stringify(found),
  );
  assert(
    found.some(
      (d) =>
        d.message.includes("region A|B") && d.message.includes("light theme"),
    ),
  );
});

test("Venn single-set labels use renderer-derived colors instead of the intersection text color", async () => {
  const source =
    '```mermaid\n---\nconfig:\n  themeVariables:\n    vennSetTextColor: "#ffffff"\n    venn1: "#2563eb"\n---\nvenn-beta\nset A: 10\n```';
  assert.deepEqual(await analyzeMermaid(source), []);
});

test("unsupported Venn style statements remain explicit errors", async () => {
  const source =
    "```mermaid\nvenn-beta\nset A: 10\nstyle A fill:#ffffff,color:#ffffff,fill-opacity:1\n```";
  const findings = await analyzeMermaid(source);
  assert.equal(findings.length, 1);
  assert.match(
    findings[0]?.message ?? "",
    /cannot be audited.*style statements/,
  );
});
test("treemap class color and fill apply to rendered labels", async () => {
  const body =
    'treemap-beta\n"Root":::bad\n  "Leaf":10:::bad\nclassDef bad fill:#ffffff,color:#ffffff';
  const found = await analyzeMermaid(`\`\`\`mermaid\n${body}\n\`\`\``);
  assert(found.some((d) => d.message.includes("1.00:1")));
});
test("family-specific title colors are audited with YAML metadata", async () => {
  const source =
    '```mermaid\n---\ntitle: Invisible\nconfig:\n  themeVariables:\n    treemap:\n      titleColor: "#ffffff"\n---\ntreemap-beta\n"Root"\n  "Leaf":10\n```';
  const found = await analyzeMermaid(source);
  assert(
    found.some(
      (d) =>
        d.message.includes("diagram title") &&
        d.message.includes("light theme"),
    ),
  );
});
test("hidden chart titles cannot create false-positive title contrast errors", async () => {
  const source =
    '```mermaid\n---\nconfig:\n  themeVariables:\n    xyChart:\n      titleColor: "#ffffff"\n      backgroundColor: "#ffffff"\n---\nxychart-beta\nx-axis [a,b]\nbar [1,2]\n```';
  assert(
    !(await analyzeMermaid(source)).some((d) =>
      d.message.includes("titleColor"),
    ),
  );
});
test("selected pie highlight uses actual opaque fill instead of default opacity", async () => {
  const source =
    '```mermaid\n---\nconfig:\n  pie:\n    highlightSlice: A\n  themeVariables:\n    pie1: "#666666"\n    pieSectionTextColor: "#ffffff"\n    pieLegendTextColor: "#000000"\n---\npie\n"A":1\n```';
  const found = await analyzeMermaid(source, {
    canvas: { light: "#fff", dark: "#fff" },
  });
  assert.deepEqual(found, []);
});

test("info version text inherits the diagram text color", async () => {
  const found = await analyzeMermaid(
    '```mermaid\n---\nconfig:\n  themeVariables:\n    textColor: "#ffffff"\n---\ninfo\n```',
  );
  assert(
    found.some(
      (d) =>
        d.message.includes("Mermaid version") &&
        d.message.includes("light theme"),
    ),
  );
});
test("swimlane uses official flowchart parser styles and nested backgrounds", async () => {
  const found = await analyzeMermaid(
    "```mermaid\nswimlane-beta LR\nsubgraph Lane\nA-->B\nend\nstyle A fill:#fff,color:#fff\n```",
  );
  assert(
    !found.some((d) => /cannot parse|cannot be audited/.test(d.message)),
    JSON.stringify(found),
  );
  assert(
    found.some(
      (d) => d.message.startsWith("A:") && d.message.includes("1.00:1"),
    ),
  );
});
test("railroad terminal colors use normalized official IR", async () => {
  const found = await analyzeMermaid(
    '```mermaid\n---\nconfig:\n  railroad:\n    terminalFill: "#ffffff"\n    terminalTextColor: "#ffffff"\n---\nrailroad-beta\nmain = sequence(terminal("x"), nonterminal("value"));\n```',
  );
  assert(
    !found.some((d) => /cannot parse|cannot be audited/.test(d.message)),
    JSON.stringify(found),
  );
  assert(
    found.some(
      (d) => d.message.startsWith("x:") && d.message.includes("1.00:1"),
    ),
  );
});
test("cynefin labels use layered domain fills in both themes", async () => {
  const found = await analyzeMermaid(
    '```mermaid\n---\nconfig:\n  themeVariables:\n    cynefin:\n      complexBg: "#ffffff"\n      labelColor: "#ffffff"\n      textColor: "#ffffff"\n---\ncynefin-beta\ncomplex\n"Work"\n```',
  );
  assert(
    !found.some((d) => /cannot parse|cannot be audited/.test(d.message)),
    JSON.stringify(found),
  );
  assert(
    found.some(
      (d) =>
        d.message.startsWith("complex domain:") &&
        d.message.includes("light theme"),
    ),
  );
});
test("eventmodeling uses official AST frame type colors", async () => {
  const found = await analyzeMermaid(
    '```mermaid\n---\nconfig:\n  themeVariables:\n    emUiFill: "#ffffff"\n    textColor: "#ffffff"\n---\neventmodeling\ntf 01 ui CartUI\ntf 02 cmd AddItem\ntf 03 evt ItemAdded\n```',
  );
  assert(
    !found.some((d) => /cannot parse|cannot be audited/.test(d.message)),
    JSON.stringify(found),
  );
  assert(
    found.some(
      (d) => d.message.startsWith("CartUI:") && d.message.includes("1.00:1"),
    ),
  );
});
