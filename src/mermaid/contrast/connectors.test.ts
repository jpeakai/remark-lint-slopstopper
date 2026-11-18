import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { analyzeMermaid, MERMAID_RULES } from "../analyze.ts";

const ONLY = { rules: [MERMAID_RULES.connectors] };
const WHITE = { light: "#ffffff", dark: "#ffffff" };

const fenced = (body: string, variables: Record<string, string> = {}) =>
  `\`\`\`mermaid\n---\nconfig: ${JSON.stringify({ themeVariables: variables })}\n---\n${body}\n\`\`\``;

const names = (findings: { message: string }[]) => findings.map((finding) => finding.message.split(":")[0]);

test("the connector fixture fails only the sections that say so", async () => {
  const markdown = await readFile(new URL("../fixtures/connectors.md", import.meta.url), "utf8");
  const section = (offset: number) => [...markdown.slice(0, offset).matchAll(/^## (.+)$/gm)].at(-1)?.[1] ?? "";

  const findings = await analyzeMermaid(markdown, ONLY);

  assert.deepEqual(
    [...new Set(findings.map((finding) => section(finding.start)))],
    ["Failing: pale link style", "Failing: default lines inside a dark cluster", "Failing: pale sequence messages"],
  );
  assert.ok(findings.every((finding) => finding.ruleId === MERMAID_RULES.connectors));
});

test("stroke opacity dims the line but not its arrowhead, and opacity dims both", async () => {
  const dimmed = await analyzeMermaid(
    fenced("flowchart LR\n  A --> B\n  linkStyle 0 stroke:#000000,stroke-opacity:0.2"),
    {
      ...ONLY,
      canvas: WHITE,
    },
  );

  const faded = await analyzeMermaid(fenced("flowchart LR\n  A --> B\n  linkStyle 0 stroke:#000000,opacity:0.2"), {
    ...ONLY,
    canvas: WHITE,
  });

  assert.deepEqual(names(dimmed), ["edge A → B line", "edge A → B line"]);
  assert.ok(dimmed.every((finding) => finding.message.includes("resolves to #cccccc on #ffffff")));
  assert.deepEqual(names(faded), Array(2).fill(["edge A → B line", "edge A → B arrowhead"]).flat());
});

test("each graph family uses its own line colour key", async () => {
  const cases: [string, Record<string, string>][] = [
    ["classDiagram\n  A --> B", { lineColor: "#ffffff" }],
    ["stateDiagram-v2\n  A --> B", { transitionColor: "#ffffff" }],
    ["erDiagram\n  A ||--o{ B : has", { lineColor: "#ffffff" }],
  ];

  for (const [body, variables] of cases) {
    const findings = await analyzeMermaid(fenced(body, variables), { ...ONLY, canvas: WHITE });

    assert.ok(findings.length > 0, body);
    assert.ok(
      findings.every((finding) => /line|arrowhead/.test(finding.message) && finding.message.includes("on #ffffff")),
      body,
    );
  }

  assert.deepEqual(
    await analyzeMermaid(fenced("stateDiagram-v2\n  A --> B", { lineColor: "#ffffff", transitionColor: "#000000" }), {
      ...ONLY,
      canvas: WHITE,
    }),
    [],
  );
});

test("a line leaving a cluster is measured on the cluster and on the page", async () => {
  const body = "flowchart LR\n  subgraph G\n    A\n  end\n  A --> B\n  style G fill:#000000";

  const findings = await analyzeMermaid(fenced(body, { lineColor: "#000000" }), { ...ONLY, canvas: WHITE });

  assert.deepEqual(
    findings.map((finding) => finding.message.match(/on (#[0-9a-f]{6})/)?.[1]),
    ["#000000", "#000000"],
  );
  assert.deepEqual(names(findings), ["edge A → B line", "edge A → B line"]);
});

test("invisible links and hidden strokes are layout, not connectors", async () => {
  const findings = await analyzeMermaid(
    fenced("flowchart LR\n  A ~~~ B\n  B --> C\n  linkStyle 1 stroke:none", { lineColor: "#ffffff" }),
    { ...ONLY, canvas: WHITE },
  );

  assert.deepEqual(findings, []);
});

test("sequence message lines and lifelines are connectors", async () => {
  const findings = await analyzeMermaid(
    fenced("sequenceDiagram\n  A->>B: hi", { signalColor: "#ffffff", actorLineColor: "#ffffff" }),
    { ...ONLY, canvas: WHITE },
  );

  assert.deepEqual([...new Set(names(findings))], ["signalColor (message line)", "actorLineColor (lifeline)"]);
});

test("families are supported, connector-free or explicitly unauditable", async () => {
  assert.deepEqual(await analyzeMermaid(fenced('pie\n  "A": 1', { lineColor: "#ffffff" }), ONLY), []);

  const wardley = await analyzeMermaid(
    fenced("wardley-beta\ncomponent A [0.5, 0.5]\ncomponent B [0.2, 0.3]\nA -> B"),
    ONLY,
  );

  assert.deepEqual(names(wardley), ["Connector contrast cannot be audited"]);
  assert.match(wardley[0]?.message ?? "", /wardley connectors are not modeled/);
});

test("connector and text policies run and stay silent independently", async () => {
  const source = fenced("flowchart LR\n  A --> B\n  style A color:#ffffff\n  linkStyle 0 stroke:#ffffff");

  const connectors = await analyzeMermaid(source, { ...ONLY, canvas: WHITE });

  const text = await analyzeMermaid(source, { rules: [MERMAID_RULES.contrast], canvas: WHITE });

  assert.ok(connectors.length > 0);
  assert.ok(connectors.every((finding) => finding.ruleId === MERMAID_RULES.connectors));
  assert.ok(text.length > 0);
  assert.ok(text.every((finding) => finding.ruleId === MERMAID_RULES.contrast));
});

test("a styled connector reports at its linkStyle line, and an unreadable stroke is unauditable", async () => {
  const markdown = fenced("flowchart LR\n  A --> B\n  linkStyle 0 stroke:#ffffff");

  const [finding] = await analyzeMermaid(markdown, { ...ONLY, canvas: WHITE });

  const unreadable = await analyzeMermaid(fenced("flowchart LR\n  A --> B\n  linkStyle 0 stroke:notacolour"), ONLY);

  assert.equal(markdown.slice(finding?.start, finding?.end).trim(), "linkStyle 0 stroke:#ffffff");
  assert.ok(unreadable.length > 0);
  assert.ok(unreadable.every((item) => item.message.startsWith("Connector contrast cannot be audited")));
});

const GITHUB = { light: "#ffffff", dark: "#0d1117" };
const findingsOf = async (source: string) =>
  (await analyzeMermaid(`\`\`\`mermaid\n${source}\n\`\`\``, { ...ONLY, canvas: GITHUB })).map(
    (finding) => `${finding.message.split(":")[0]} | ${finding.message.match(/in the (\w+) theme/)?.[1] ?? "-"}`,
  );

test("native family connectors fail where the browser paints them unreadably, in each theme", async () => {
  assert.deepEqual(await findingsOf("treeView-beta\nroot\n  child"), ["tree line | dark"]);
  assert.deepEqual(await findingsOf('C4Context\nSystem(a, "A")\nSystem(b, "B")\nRel(a, b, "uses")'), [
    "relation a → b line | dark",
  ]);
  assert.deepEqual(
    await findingsOf(
      '---\nconfig:\n  themeVariables:\n    treeView:\n      lineColor: "#888888"\n---\ntreeView-beta\nroot\n  child',
    ),
    [],
  );
});

test("readable native family connectors pass in both themes", async () => {
  for (const source of [
    "architecture-beta\n  service a(server)[A]\n  service b(server)[B]\n  a:R --> L:b",
    "requirementDiagram\nrequirement r {\nid: 1\ntext: t\nrisk: low\nverifymethod: test\n}\nelement e {\ntype: x\n}\ne - satisfies -> r",
    "ishikawa-beta\nEffect\n  Cause",
    'railroad-beta\nmain = terminal("x");',
    "block-beta\n  columns 2\n  a b\n  a --> b",
    "timeline\n  2026 : Launch",
  ]) {
    assert.deepEqual(await findingsOf(source), [], source);
  }
});

test("a C4 or timeline arrowhead inherits the diagram's text paint", async () => {
  const pale = '---\nconfig:\n  themeVariables:\n    textColor: "#eeeeee"\n---\n';

  assert.ok(
    (await findingsOf(`${pale}C4Context\nSystem(a, "A")\nSystem(b, "B")\nRel(a, b, "uses")`)).includes(
      "relation a → b arrowhead | light",
    ),
  );
  assert.ok((await findingsOf(`${pale}timeline\n  2026 : Launch`)).includes("timeline arrowhead | light"));
});

test("the timeline baseline falls back to black when the palette limit names no colour", async () => {
  // With a palette limit of 2, the last section rule paints cScaleLabel1.
  const labelled = (label: string) =>
    `---\nconfig:\n  themeVariables:\n    THEME_COLOR_LIMIT: 2\n    cScaleLabel1: "${label}"\n---\ntimeline\n  2026 : Launch`;

  assert.deepEqual(await findingsOf(labelled("#eeeeee")), ["timeline line | light"]);
  assert.deepEqual(await findingsOf(labelled("inherit")), ["timeline line | dark"]);
});

test("block edges inside a composite block are explicitly unauditable", async () => {
  const findings = await analyzeMermaid(
    fenced("block-beta\n  columns 1\n  block:outer\n    a b\n  end\n  a --> b"),
    ONLY,
  );

  assert.match(findings.map((finding) => finding.message).join("\n"), /block edges inside composite blocks/);
});
