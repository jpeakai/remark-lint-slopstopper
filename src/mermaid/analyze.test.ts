import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMermaid, MERMAID_RULES } from "./analyze.ts";
import { calculateComplexity, thresholdsFrom } from "./complexity/metrics.ts";
import { extractStats } from "./parsing/statistics.ts";

const fenced = (body: string) => `\`\`\`mermaid\n${body}\n\`\`\``;

test("valid default flowchart reads official model and theme variables", async () => {
  assert.deepEqual(await analyzeMermaid(fenced("flowchart LR\nA-->B")), []);
});
test("partial fill styles use default dark text color and report both themes", async () => {
  const found = await analyzeMermaid(
    fenced("flowchart LR\nA\nstyle A fill:#fff"),
  );
  assert(
    found.some(
      (d) =>
        d.ruleId === MERMAID_RULES.contrast && d.message.includes("dark theme"),
    ),
  );
  assert(found.every((d) => !d.fix));
});
test("text-only styles resolve the theme node background", async () => {
  const found = await analyzeMermaid(
    fenced("flowchart LR\nA\nstyle A color:#fff"),
  );
  assert(found.some((d) => d.message.includes("light theme")));
});
test("transparent fill and text composite against the actual host canvas", async () => {
  const found = await analyzeMermaid(
    fenced("flowchart LR\nA\nstyle A fill:#ffffff00,color:#ffffff80"),
  );
  assert(
    found.some(
      (d) => d.message.includes("light theme") && d.message.includes("#ffffff"),
    ),
  );
});
test("parser errors produce diagnostics and no fabricated VCS", async () => {
  const found = await analyzeMermaid(fenced("flowchart LR\nA-->"));
  assert.equal(found.length, 1);
  assert.equal(found[0].ruleId, MERMAID_RULES.parse);
});
test("fake Mermaid fences inside HTML and plain code are ignored", async () => {
  assert.deepEqual(
    await analyzeMermaid(
      "<!--\n```mermaid\nbad\n```\n-->\n\n````text\n```mermaid\nbad\n```\n````",
    ),
    [],
  );
});
test("VCS includes official parser row, edge, group, and depth counts", async () => {
  const source = "flowchart LR\nsubgraph Group\nA-->B\nend";
  const stats = await extractStats(source);
  assert.equal(stats.error, null);
  assert.equal(
    calculateComplexity(stats, thresholdsFrom({})).visual_complexity_score,
    6.05,
  );
});
test("over-threshold complexity includes verified split-plan recommendations", async () => {
  const graph =
    "flowchart LR\n" +
    Array.from({ length: 25 }, (_, i) => `N${i}-->N${i + 1}`).join("\n");
  const found = await analyzeMermaid(fenced(graph), {
    complexity: { preset: "low-density" },
  });
  const result = found.find((d) => d.ruleId === MERMAID_RULES.complexity);
  assert(result);
  assert.match(result.message, /Split-plan recommendation/);
  assert.match(
    result.message,
    /contract verified|Target at most|list reads better/,
  );
});
test("offsets are absolute UTF16 positions inside nested Markdown fences", async () => {
  const source =
    "😀 Introduction.\n\n> ```mermaid\n> flowchart LR\n> A\n> style A color:#fff,fill:#fff\n> ```";
  const found = await analyzeMermaid(source);
  assert(found.length > 0);
  assert.equal(
    source.slice(found[0].start, found[0].end),
    "> style A color:#fff,fill:#fff",
  );
});

test("class inheritance is merged before checking each actual node", async () => {
  const body =
    "flowchart LR\nA:::bad-->B\nclassDef bad fill:#fff,color:#fff\nstyle A color:#000";
  assert.deepEqual(await analyzeMermaid(fenced(body)), []);
});
test("translucent children resolve against nested cluster backgrounds", async () => {
  const body =
    "flowchart LR\nsubgraph Outer\nA\nend\nstyle Outer fill:#000,color:#fff\nstyle A fill:#0000,color:#fff";
  assert.deepEqual(await analyzeMermaid(fenced(body)), []);
});
test("custom theme variables affect default node foreground/background", async () => {
  const body =
    "---\nconfig:\n  themeVariables:\n    mainBkg: '#ffffff'\n    textColor: '#ffffff'\n---\nflowchart LR\nA";
  const found = await analyzeMermaid(fenced(body));
  assert(found.some((d) => d.message.includes("light theme")));
});
test("sequence note theme variables are audited without declared style statements", async () => {
  const body =
    "---\nconfig:\n  themeVariables:\n    noteTextColor: '#ffffff'\n    noteBkgColor: '#ffffff'\n---\nsequenceDiagram\nparticipant A\nNote right of A: Example";
  const found = await analyzeMermaid(fenced(body));
  assert(
    found.some(
      (d) =>
        d.ruleId === MERMAID_RULES.contrast && d.message.includes("1.00:1"),
    ),
  );
});
test("ER attribute row backgrounds use actual resolved row theme variables", async () => {
  const body =
    "---\nconfig:\n  themeVariables:\n    rowOdd: '#ffffff'\n---\nerDiagram\nA {\nstring name\n}\nstyle A color:#fff,fill:#000";
  const found = await analyzeMermaid(fenced(body));
  assert(
    found.some(
      (d) => d.message.includes("rowOdd") && d.message.includes("1.00:1"),
    ),
  );
});
test("custom CSS never silently passes", async () => {
  const css = await analyzeMermaid(
    fenced(
      "---\nconfig:\n  themeCSS: '.nodeLabel {color:white}'\n---\nflowchart LR\nA",
    ),
  );
  assert(css.some((d) => d.message.includes("themeCSS")));
});

test("titles are checked against the host page canvas", async () => {
  const body =
    "---\ntitle: Invisible heading\nconfig:\n  themeVariables:\n    titleColor: '#ffffff'\n---\nflowchart LR\nA-->B";
  const found = await analyzeMermaid(fenced(body));
  assert(
    found.some(
      (d) =>
        d.message.includes("diagram title") &&
        d.message.includes("light theme"),
    ),
  );
});
test("state transitions and notes audit their own theme colors", async () => {
  const body =
    "---\nconfig:\n  themeVariables:\n    transitionLabelColor: '#ffffff'\n    edgeLabelBackground: '#ffffff'\n    noteTextColor: '#ffffff'\n    noteBkgColor: '#ffffff'\n---\nstateDiagram-v2\nA --> B: trigger\nnote right of A: Note";
  const found = await analyzeMermaid(fenced(body));
  assert(
    found.some(
      (d) => d.message.includes("edge edge0") && d.message.includes("1.00:1"),
    ),
  );
  assert(
    found.some(
      (d) => d.message.includes("note ") && d.message.includes("1.00:1"),
    ),
  );
});

test("inline HTML styling in node and edge labels cannot bypass contrast", async () => {
  for (const body of [
    "flowchart LR\nA[\"<span style='color:white;background:white'>Invisible</span>\"]",
    "stateDiagram-v2\nstate \"<span style='color:white;background:white'>Invisible</span>\" as A",
    "flowchart LR\nA -->|\"<span style='color:white;background:white'>Invisible</span>\"| B",
  ]) {
    assert(
      (await analyzeMermaid(fenced(body))).some((d) =>
        d.message.includes("inline HTML"),
      ),
    );
  }
});

test("transparent nested states resolve against their composite parent", async () => {
  const body =
    "stateDiagram-v2\nstate Outer {\nA\n}\nstyle Outer fill:#ffffff,color:#000000\nstyle A fill:#ffffff00,color:#ffffff";
  const found = await analyzeMermaid(fenced(body), {
    canvas: { light: "#000", dark: "#000" },
  });
  assert(
    found.some(
      (d) =>
        d.message.startsWith("A:") &&
        d.message.includes("dark theme") &&
        d.message.includes("1.00:1"),
    ),
  );
});

test("composite state titles use their own title strip and state label color", async () => {
  const source =
    "---\nconfig:\n  themeVariables:\n    compositeBackground: '#ffffff'\n    compositeTitleBackground: '#ffffff'\n    titleColor: '#000000'\n    stateLabelColor: '#ffffff'\n---\nstateDiagram-v2\nstate Outer {\nA\n}\nstyle A fill:#000000,color:#ffffff";
  const found = await analyzeMermaid(fenced(source));
  for (const theme of ["light", "dark"]) {
    assert(
      found.some(
        (finding) =>
          finding.message.includes("Outer:") &&
          finding.message.includes(`${theme} theme`) &&
          finding.message.includes("1.00:1"),
      ),
    );
  }
});

test("transparent states use alternating nested composite backgrounds", async () => {
  const source =
    "---\nconfig:\n  themeVariables:\n    compositeBackground: '#000000'\n    compositeTitleBackground: '#000000'\n    altBackground: '#ffffff'\n    titleColor: '#ffffff'\n    stateLabelColor: '#ffffff'\n---\nstateDiagram-v2\nstate Outer {\nstate Inner {\nA\n}\n}\nstyle A fill:#ffffff00,color:#ffffff";
  const found = await analyzeMermaid(fenced(source), {
    canvas: { light: "#000000", dark: "#000000" },
  });
  for (const theme of ["light", "dark"]) {
    assert(
      found.some(
        (finding) =>
          finding.message.includes("A:") &&
          finding.message.includes(`${theme} theme`) &&
          finding.message.includes("1.00:1"),
      ),
    );
  }
});
