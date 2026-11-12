import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { analyzeMermaid } from "../analyze.ts";
import { scoreSequence } from "./sequence.ts";

const canvas = (color: string) => ({ light: color, dark: color });

function audit(body: string, variables: Record<string, string>, page = "#ffffff") {
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

  const findings = await audit(body, { actorTextColor: "#000000", actorBkg: "#ffffff" }, "#000000");

  assert.equal(findings.length, 2);
  assert(
    findings.every((finding) => finding.message.includes("unboxed actor label") && finding.message.includes("1.00:1")),
  );
});

test("boxed participants check actual participant fills without inventing message labels", async () => {
  const body = "sequenceDiagram\nparticipant A as Service";

  assert.deepEqual(await audit(body, { ...safeActors, signalTextColor: "#ffffff" }), []);

  const findings = await audit(body, {
    actorTextColor: "#ffffff",
    actorBkg: "#ffffff",
    signalTextColor: "#000000",
  });

  assert.equal(findings.length, 2);
  assert(
    findings.every((finding) => finding.message.startsWith("actorTextColor:") && finding.message.includes("1.00:1")),
  );
});

test("unused rect and autonumber declarations create no text findings", async () => {
  const body = "sequenceDiagram\nparticipant A\nautonumber\nrect rgb(0,0,0)\nend";

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
    findings.every((finding) => finding.message.startsWith("signalTextColor:") && finding.message.includes("1.00:1")),
  );
});

test("signals inside a rect do not also acquire a fictitious page backing", async () => {
  const body = "sequenceDiagram\nrect rgb(255,255,255)\nA->>B: Message\nend";

  assert.deepEqual(await audit(body, { ...safeActors, signalTextColor: "#000000" }, "#000000"), []);
});

test("mixed page and rect messages retain their separate backdrops", async () => {
  const body = "sequenceDiagram\nA->>B: Outside\nrect rgb(255,255,255)\nA->>B: Inside\nend";

  const findings = await audit(body, { ...safeActors, signalTextColor: "#000000" }, "#000000");

  assert.equal(findings.length, 2);
  assert(
    findings.every(
      (finding) => finding.message.startsWith("signalTextColor:") && finding.message.includes("on #000000"),
    ),
  );
});

test("nested translucent rect fills composite in parser statement order", async () => {
  const body = "sequenceDiagram\nrect rgb(0,0,0)\nrect rgba(255,255,255,0.5)\nA->>B: Message\nend\nend";

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

const messages = (findings: { message: string }[]) => findings.map((finding) => finding.message.split(":")[0]);

test("a message within one opaque group is measured on the group fill, not the page", async () => {
  const findings = await audit(
    "sequenceDiagram\nbox rgb(0,0,0) Shop\nparticipant A\nparticipant B\nend\nA->>B: hello",
    { ...safeActors, textColor: "#ffffff", signalTextColor: "#000000" },
  );

  assert.deepEqual(messages(findings), Array(2).fill("signalTextColor (in group Shop)"));
  assert(findings.every((finding) => finding.message.includes("on #000000") && finding.message.includes("1.00:1")));
});

test("a message crossing groups is measured on each group it spans and the page gap", async () => {
  const findings = await audit(
    "sequenceDiagram\nbox rgb(0,0,0)\nparticipant A\nend\nbox rgb(255,255,255)\nparticipant B\nend\nA->>B: hello",
    { ...safeActors, signalTextColor: "#ffffff" },
  );

  assert.deepEqual(messages(findings), [
    "signalTextColor (in group 2)",
    "signalTextColor",
    "signalTextColor (in group 2)",
    "signalTextColor",
  ]);
});

test("self messages reach the page beside an edge participant but not beside an inner one", async () => {
  const group = "sequenceDiagram\nbox rgb(0,0,0) Shop\nparticipant A\nparticipant B\nparticipant C\nend\n";
  const variables = { ...safeActors, textColor: "#ffffff", signalTextColor: "#ffffff" };

  assert.deepEqual(await audit(`${group}B->>B: recompute`, variables), []);
  assert.deepEqual(messages(await audit(`${group}C->>C: recompute`, variables)), Array(2).fill("signalTextColor"));
  assert.deepEqual(messages(await audit(`${group}A->>A: recompute`, variables)), Array(2).fill("signalTextColor"));
});

test("notes beside an edge participant reach the page, and notes over the group stay inside", async () => {
  const group = "sequenceDiagram\nbox rgb(0,0,0) Shop\nparticipant A\nparticipant B\nend\n";
  const variables = {
    ...safeActors,
    textColor: "#ffffff",
    noteTextColor: "#ffffff",
    noteBkgColor: "rgba(0,0,0,0)",
  };

  assert.deepEqual(await audit(`${group}Note over A,B: inside`, variables), []);
  assert.deepEqual(messages(await audit(`${group}Note left of A: outside`, variables)), Array(2).fill("noteTextColor"));
  assert.deepEqual(messages(await audit(`${group}Note right of A: between`, variables)), []);
});

test("nested translucent rects composite over the group fill in statement order", async () => {
  const findings = await audit(
    [
      "sequenceDiagram",
      "box rgb(0,0,255) Shop",
      "participant A",
      "participant B",
      "end",
      "rect rgba(255,0,0,0.5)",
      "rect rgba(0,255,0,0.5)",
      "A->>B: nested",
      "end",
      "end",
    ].join("\n"),
    { ...safeActors, textColor: "#ffffff", signalTextColor: "#408040" },
  );

  // White page, then blue, then half red, then half green: (64, 128, 64).
  assert.deepEqual(messages(findings), Array(2).fill("signalTextColor (rect) (in group Shop)"));
  assert(findings.every((finding) => finding.message.includes("on #408040")));
});

test("a group that is not adjacent in participant order is precisely unmeasurable", async () => {
  const findings = await audit(
    "sequenceDiagram\nparticipant A\nparticipant C\nbox rgb(0,0,0) Shop\nparticipant B\nparticipant A\nend\nA->>B: hi",
    { ...safeActors, textColor: "#ffffff" },
  );

  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? "", /group Shop has members declared apart/);
});

test("a frame without messages beside painted groups is precisely unmeasurable", async () => {
  const findings = await audit("sequenceDiagram\nbox rgb(0,0,0) Shop\nparticipant A\nend\nloop forever\nend", {
    ...safeActors,
    textColor: "#ffffff",
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0]?.message ?? "", /frame without messages has no measurable position/);
});

test("lifelines and message lines are exposed as connectors, never as text findings", async () => {
  const source = "sequenceDiagram\nbox rgb(0,0,0) Shop\nparticipant A\nparticipant B\nend\nA->>B: hi";
  const variables = { signalColor: "#000000", actorLineColor: "#000000", textColor: "#ffffff" };

  const result = await scoreSequence(`---\nconfig: ${JSON.stringify({ themeVariables: variables })}\n---\n${source}`);
  const connectors = result.pairs.filter((pair) => pair.kind === "connector" && pair.theme === "light");

  assert.deepEqual(
    connectors.map((pair) => [pair.selector, pair.foreground, pair.background]),
    [
      ["signalColor (message line) (in group Shop)", "#000000", "#000000"],
      ["actorLineColor (lifeline) (in group Shop)", "#000000", "#000000"],
      ["actorLineColor (lifeline) (in group Shop)", "#000000", "#000000"],
    ],
  );
  assert.deepEqual(await audit(source, { ...safeActors, ...variables, signalTextColor: "#ffffff" }), []);
});

test("transparent participant groups preserve auditable page message labels", async () => {
  const findings = await audit("sequenceDiagram\nbox transparent\nparticipant A\nend\nparticipant B\nA->>B: hello", {
    ...safeActors,
    signalTextColor: "#ffffff",
  });

  assert.equal(findings.length, 2);
  assert(findings.every((finding) => finding.message.startsWith("signalTextColor:")));
});

test("named group titles are measured in the root text colour on their own fill", async () => {
  assert.deepEqual(await audit("sequenceDiagram\nbox rgb(0,0,0)\nparticipant A\nend", safeActors), []);

  const findings = await audit("sequenceDiagram\nbox rgb(0,0,0) Group\nparticipant A\nend", {
    ...safeActors,
    textColor: "#000000",
  });

  assert.deepEqual(messages(findings), Array(2).fill("textColor (group Group title)"));
  assert(findings.every((finding) => finding.message.includes("on #000000")));

  assert.deepEqual(
    await audit("sequenceDiagram\nbox rgb(0,0,0) Group\nparticipant A\nend", { ...safeActors, textColor: "#ffffff" }),
    [],
  );
});

const withConfig = (config: Record<string, unknown>) =>
  `---\nconfig: ${JSON.stringify(config)}\n---\nsequenceDiagram\n  A->>B: hi`;

test("custom themeCSS blocks the sequence audit at its frontmatter line", async () => {
  const { pairs, skipped } = await scoreSequence(withConfig({ themeCSS: ".actor { fill: red; }" }));

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
  const { pairs, skipped } = await scoreSequence(withConfig({ themeVariables: { primaryColor: "not-a-colour" } }));

  assert.deepEqual(pairs, []);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0]?.selector, "themeVariables");
  assert.equal(skipped[0]?.blocking, true);
  assert.match(skipped[0]?.reason ?? "", /^Mermaid could not resolve the theme: /);
});

test("source Mermaid cannot parse yields no pairs and no skipped surfaces", async () => {
  assert.deepEqual(await scoreSequence("sequenceDiagram\n  A->>"), {
    pairs: [],
    skipped: [],
  });
});

test("the participant group fixture fails only where a label really sits on the page", async () => {
  const markdown = await readFile(new URL("../fixtures/sequence-groups.md", import.meta.url), "utf8");
  const section = (offset: number) =>
    [...markdown.slice(0, offset).matchAll(/^## (.+)$/gm)].at(-1)?.[1] ?? "before any section";

  const findings = await analyzeMermaid(markdown, { rules: ["mermaid/contrast-text-below-aa"] });

  assert.deepEqual(
    findings.map((finding) => [section(finding.start), finding.message.split(" in the ")[0]]),
    [
      ["Transparent group", "signalTextColor: text #64748b resolves to #64748b on #0d1117"],
      ["Self message on an edge participant", "signalTextColor: text #ffffff resolves to #ffffff on #ffffff"],
    ],
  );
});
