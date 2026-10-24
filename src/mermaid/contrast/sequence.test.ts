import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMermaid } from "../analyze.ts";
import { scoreSequence } from "./sequence.ts";

const canvas = (color: string) => ({ light: color, dark: color });
function audit(
  body: string,
  variables: Record<string, string>,
  page = "#ffffff",
) {
  const source = `\`\`\`mermaid\n---\nconfig: ${JSON.stringify({ themeVariables: variables })}\n---\n${body}\n\`\`\``;
  return analyzeMermaid(source, {
    rules: ["mermaid/contrast-text-below-aa"],
    canvas: canvas(page),
  });
}
const safeActors = { actorTextColor: "#000000", actorBkg: "#ffffff" };

test("empty sequence diagrams have no participant or message text surfaces", async () => {
  assert.deepEqual(
    await audit("sequenceDiagram", {
      actorTextColor: "#ffffff",
      actorBkg: "#ffffff",
      signalTextColor: "#ffffff",
    }),
    [],
  );
});

test("human-only actor labels use the page instead of a nonexistent participant box", async () => {
  const body = "sequenceDiagram\nactor A as Alice";
  assert.deepEqual(
    await audit(
      body,
      {
        actorTextColor: "#ffffff",
        actorBkg: "#ffffff",
        signalTextColor: "#ffffff",
      },
      "#000000",
    ),
    [],
  );
  const findings = await audit(
    body,
    { actorTextColor: "#000000", actorBkg: "#ffffff" },
    "#000000",
  );
  assert.equal(findings.length, 2);
  assert(
    findings.every(
      (finding) =>
        finding.message.includes("unboxed actor label") &&
        finding.message.includes("1.00:1"),
    ),
  );
});

test("boxed participants check actual participant fills without inventing message labels", async () => {
  const body = "sequenceDiagram\nparticipant A as Service";
  assert.deepEqual(
    await audit(body, { ...safeActors, signalTextColor: "#ffffff" }),
    [],
  );
  const findings = await audit(body, {
    actorTextColor: "#ffffff",
    actorBkg: "#ffffff",
    signalTextColor: "#000000",
  });
  assert.equal(findings.length, 2);
  assert(
    findings.every(
      (finding) =>
        finding.message.startsWith("actorTextColor:") &&
        finding.message.includes("1.00:1"),
    ),
  );
});

test("unused rect and autonumber declarations create no text findings", async () => {
  const body =
    "sequenceDiagram\nparticipant A\nautonumber\nrect rgb(0,0,0)\nend";
  assert.deepEqual(
    await audit(body, {
      ...safeActors,
      signalTextColor: "#ffffff",
      sequenceNumberColor: "#ffffff",
      signalColor: "#ffffff",
    }),
    [],
  );
});

test("a real signal label is checked when no rect supplies a backing", async () => {
  const findings = await audit("sequenceDiagram\nA->>B: Message", {
    ...safeActors,
    signalTextColor: "#ffffff",
  });
  assert.equal(findings.length, 2);
  assert(
    findings.every(
      (finding) =>
        finding.message.startsWith("signalTextColor:") &&
        finding.message.includes("1.00:1"),
    ),
  );
});

test("signals inside a rect do not also acquire a fictitious page backing", async () => {
  const body = "sequenceDiagram\nrect rgb(255,255,255)\nA->>B: Message\nend";
  assert.deepEqual(
    await audit(body, { ...safeActors, signalTextColor: "#000000" }, "#000000"),
    [],
  );
});

test("mixed page and rect messages retain their separate backdrops", async () => {
  const body =
    "sequenceDiagram\nA->>B: Outside\nrect rgb(255,255,255)\nA->>B: Inside\nend";
  const findings = await audit(
    body,
    { ...safeActors, signalTextColor: "#000000" },
    "#000000",
  );
  assert.equal(findings.length, 2);
  assert(
    findings.every(
      (finding) =>
        finding.message.startsWith("signalTextColor:") &&
        finding.message.includes("on #000000"),
    ),
  );
});

test("nested translucent rect fills composite in parser statement order", async () => {
  const body =
    "sequenceDiagram\nrect rgb(0,0,0)\nrect rgba(255,255,255,0.5)\nA->>B: Message\nend\nend";
  const findings = await audit(body, {
    ...safeActors,
    signalTextColor: "#808080",
  });
  assert.equal(findings.length, 2);
  assert(
    findings.every(
      (finding) =>
        finding.message.includes("signalTextColor (rect)") &&
        finding.message.includes("on #808080") &&
        finding.message.includes("1.00:1"),
    ),
  );
});

test("notes and frame labels inherit their enclosing nested rect backing", async () => {
  const body =
    "sequenceDiagram\nrect rgb(0,0,0)\nrect rgba(255,255,255,0.5)\nloop Condition\nNote over A: Note\nend\nend\nend";
  const findings = await audit(body, {
    ...safeActors,
    noteTextColor: "#808080",
    noteBkgColor: "#ffffff00",
    loopTextColor: "#808080",
    labelTextColor: "#ffffff",
    labelBoxBkgColor: "#000000",
  });
  for (const label of ["noteTextColor", "loopTextColor"]) {
    assert.equal(
      findings.filter(
        (finding) =>
          finding.message.startsWith(`${label} (rect):`) &&
          finding.message.includes("on #808080") &&
          finding.message.includes("1.00:1"),
      ).length,
      2,
    );
  }
});

test("autonumber state applies only to signals encountered while numbering is enabled", async () => {
  const body = "sequenceDiagram\nautonumber\nautonumber off\nA->>B: Message";
  assert.deepEqual(
    await audit(body, {
      ...safeActors,
      signalTextColor: "#000000",
      sequenceNumberColor: "#ffffff",
      signalColor: "#ffffff",
    }),
    [],
  );
});

test("human actor labels composite over their participant group fill", async () => {
  const findings = await audit(
    "sequenceDiagram\nbox rgb(255,255,255)\nactor A as Alice\nend",
    { actorTextColor: "#ffffff", actorBkg: "#000000" },
    "#000000",
  );
  assert.equal(findings.length, 2);
  assert(findings.every((finding) => finding.message.includes("1.00:1")));
});

test("translucent participant labels composite over their group fill", async () => {
  const findings = await audit(
    "sequenceDiagram\nbox rgb(255,255,255)\nparticipant A\nend",
    { actorTextColor: "#808080", actorBkg: "rgba(0,0,0,0.5)" },
    "#000000",
  );
  assert.equal(findings.length, 2);
  assert(findings.every((finding) => finding.message.includes("1.00:1")));
});

test("painted group message placement is explicitly unauditable", async () => {
  const findings = await audit(
    "sequenceDiagram\nbox rgb(255,255,255)\nparticipant A\nend\nparticipant B\nA->>B: hello",
    safeActors,
  );
  assert.equal(findings.length, 1);
  assert(findings[0]?.message.includes("without rendered geometry"));
});

test("transparent participant groups preserve auditable page message labels", async () => {
  const findings = await audit(
    "sequenceDiagram\nbox transparent\nparticipant A\nend\nparticipant B\nA->>B: hello",
    { ...safeActors, signalTextColor: "#ffffff" },
  );
  assert.equal(findings.length, 2);
  assert(
    findings.every((finding) => finding.message.startsWith("signalTextColor:")),
  );
});

test("named participant groups explicitly report unmodeled title styling", async () => {
  assert.deepEqual(
    await audit(
      "sequenceDiagram\nbox rgb(255,255,255)\nparticipant A\nend",
      safeActors,
    ),
    [],
  );
  const findings = await audit(
    "sequenceDiagram\nbox rgb(255,255,255) Group\nparticipant A\nend",
    safeActors,
  );
  assert.equal(findings.length, 1);
  assert(
    findings[0]?.message.includes("group title text styling is not modeled"),
  );
});

const withConfig = (config: Record<string, unknown>) =>
  `---\nconfig: ${JSON.stringify(config)}\n---\nsequenceDiagram\n  A->>B: hi`;

test("custom themeCSS blocks the sequence audit at its frontmatter line", async () => {
  const { pairs, skipped } = await scoreSequence(
    withConfig({ themeCSS: ".actor { fill: red; }" }),
  );
  assert.deepEqual(pairs, []);
  assert.deepEqual(skipped, [
    {
      selector: "themeCSS",
      line: 2,
      reason: "themeCSS restyles the diagram with CSS the audit cannot model",
      blocking: true,
    },
  ]);
});

test("a base colour Mermaid cannot resolve blocks the sequence audit", async () => {
  const { pairs, skipped } = await scoreSequence(
    withConfig({ themeVariables: { primaryColor: "not-a-colour" } }),
  );
  assert.deepEqual(pairs, []);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0]?.selector, "themeVariables");
  assert.equal(skipped[0]?.blocking, true);
  assert.match(
    skipped[0]?.reason ?? "",
    /^Mermaid could not resolve the theme: /,
  );
});

test("source Mermaid cannot parse yields no pairs and no skipped surfaces", async () => {
  assert.deepEqual(await scoreSequence("sequenceDiagram\n  A->>"), {
    pairs: [],
    skipped: [],
  });
});
