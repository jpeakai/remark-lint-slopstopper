import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeMermaid, MERMAID_RULES } from "../analyze.ts";
import { titleSurface } from "./surfaces.ts";
import type { ThemeVariables } from "./theme.ts";

test("title surfaces respect family colours, defaults and the host canvas", () => {
  const page = "#ffffff";
  const defaults = {
    cynefin: { labelColor: "#222222" },
    xyChart: { titleColor: "#333333", backgroundColor: "#eeeeee" },
  };
  const cases: [string, ThemeVariables, string, string][] = [
    ["pie", { pieTitleTextColor: "#111111" }, "#111111", page],
    ["venn", { titleColor: "#444444" }, "#444444", page],
    ["packet", { packet: { titleColor: "#555555" } }, "#555555", page],
    ["packet", {}, "black", page],
    ["treemap", { treemap: { titleColor: "#666666" } }, "#666666", page],
    ["treemap", { titleColor: "#777777" }, "#777777", page],
    ["cynefin", {}, "#222222", page],
    ["xychart", { xyChart: { titleColor: "#888888" } }, "#888888", "#eeeeee"],
    ["info", { textColor: "#999999" }, "#999999", page],
  ];

  for (const [kind, vars, foreground, background] of cases) {
    assert.deepEqual(titleSurface(kind, vars, defaults, page), { foreground, background }, kind);
  }
});

function fenced(source: string): string {
  return (
    "```mermaid\n---\nconfig:\n  themeVariables:\n    textColor: '#ffffff'\n    mainBkg: '#ffffff'\n    edgeLabelBackground: '#ffffff'\n---\n" +
    source +
    "\n```"
  );
}

test("block spacer cells are omitted while labelled edges still receive contrast checks", async () => {
  const source = 'block-beta\ncolumns 3\na["A"] space b["B"]\na-- "Connects" -->b';

  const findings = await analyzeMermaid(fenced(source), { rules: [MERMAID_RULES.contrast] });

  assert(!findings.some((finding) => /cannot be audited|cannot parse/.test(finding.message)));
  assert(findings.some((finding) => finding.message.startsWith("edge labels:") && finding.message.includes("1.00:1")));
  assert(!findings.some((finding) => finding.message.startsWith("space:")));
});

test("unknown architecture icons audit their rendered fallback text in both themes", async () => {
  const findings = await analyzeMermaid(fenced("architecture-beta\nservice api(missing)[API]"), {
    rules: [MERMAID_RULES.contrast],
  });
  const icons = findings.filter((finding) => finding.message.startsWith("icon missing:"));

  assert.equal(icons.length, 2);
  assert(icons.some((finding) => finding.message.includes("light theme (4.42:1")));
  assert(icons.some((finding) => finding.message.includes("dark theme (4.42:1")));
});

test("nested C4 boundaries resolve inherited backgrounds and include the diagram title", async () => {
  const source =
    'C4Context\ntitle Nested context\nSystem_Boundary(outer,"Outer") {\nSystem_Boundary(inner,"Inner") {\nSystem(app,"Application")\n}\n}\nPerson(user,"User")\nRel(user,app,"Uses")';

  const findings = await analyzeMermaid(fenced(source), { rules: [MERMAID_RULES.contrast] });

  assert(!findings.some((finding) => /cannot be audited|cannot parse/.test(finding.message)));
  assert(findings.some((finding) => finding.message.startsWith("outer:") && finding.message.includes("#0d1117")));
  assert(findings.some((finding) => finding.message.startsWith("inner:") && finding.message.includes("#0d1117")));
  assert(findings.some((finding) => finding.message.startsWith("C4 title:") && finding.message.includes("dark theme")));
});
