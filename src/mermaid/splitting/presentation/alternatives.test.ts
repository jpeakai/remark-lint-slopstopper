import assert from "node:assert/strict";
import { test } from "node:test";
import { type DiagramGraph, extractGraph } from "../../parsing/graph.ts";
import { meshMatrix, starList } from "./alternatives.ts";

test("a star lists its hub's links by way, then other edges, then unlinked nodes", async () => {
  const graph = await extractGraph(
    [
      "flowchart TD",
      "H[Hub]-->A[Alpha]",
      "H-->B[Alpha]",
      "H<-->C",
      "H---D",
      "E-- go -->H",
      "A-.->B",
      "Z[Lonely]",
      "subgraph S[Sub]",
      "Q",
      "end",
      "H-->S",
    ].join("\n"),
  );
  assert.deepEqual(starList(graph), {
    kind: "list",
    markdown: [
      "- **Hub**, 6 links:",
      "  - Out of it (3):",
      "    - Alpha (`A`)",
      "    - Alpha (`B`)",
      "    - Sub",
      "  - Linked with it as `<-->` (1):",
      "    - C",
      "  - Linked with it (1):",
      "    - D",
      "  - Into it, labelled *go* (1):",
      "    - E",
      "- **Alpha (`A`)**:",
      "  - Out of it as `-.->` (1):",
      "    - Alpha (`B`)",
      "- **Lonely**, no links",
      "- **Q**, no links",
    ].join("\n"),
  });
});

test("a star writes erDiagram cardinalities and escapes markdown in names", () => {
  const graph: DiagramGraph = {
    diagram_type: "er",
    nodes: [
      { id: "H", label: "# Hub", parent: null },
      { id: "A", label: "1. a_b|c", parent: null },
      { id: "B", label: "", parent: null },
    ],
    edges: [
      {
        id: "e1",
        source: "H",
        target: "A",
        kind: "--",
        cardinality: "||--o{",
        label: "has <b>many</b>",
      },
      { id: "e2", source: "B", target: "H", kind: "--", cardinality: "}|--||" },
    ],
    subgraphs: [],
  };
  assert.equal(
    starList(graph).markdown,
    [
      "- **\\# Hub**, 2 links:",
      "  - Out of it as `||--o{`, labelled *has many* (1):",
      "    - 1\\. a\\_b\\|c",
      "  - Into it as `}|--||` (1):",
      "    - B",
    ].join("\n"),
  );
});

test("a mesh matrix draws every edge in both cells and names unlinked pairs", async () => {
  const graph = await extractGraph(
    "flowchart LR\nA-->B\nB<-->C\nC---A\nA-->A\nD",
  );
  assert.deepEqual(meshMatrix(graph), {
    kind: "matrix",
    markdown: [
      "4 nodes, 3 of 6 pairs linked by 4 edges. Not linked: A and D; B and D; C and D.",
      "",
      "In each cell, → runs from the row to the column, ← from the column to the row; ↔ runs both ways; ● is a link with no direction.",
      "",
      "| | A | B | C | D |",
      "|---|:-:|:-:|:-:|:-:|",
      "| **A** | → | → | ● |  |",
      "| **B** | ← |  | ↔ `<-->` |  |",
      "| **C** | ● | ↔ `<-->` |  |  |",
      "| **D** |  |  |  |  |",
    ].join("\n"),
  });
});

test("a fully linked mesh escapes table pipes in connectors and joins repeated edges", async () => {
  const graph = await extractGraph(
    "erDiagram\nA ||--o{ B : has\nB }|--|| A : owns",
  );
  assert.equal(
    meshMatrix(graph).markdown,
    [
      "2 nodes, 1 of 1 pairs linked by 2 edges. Every pair is linked.",
      "",
      "In each cell, → runs from the row to the column, ← from the column to the row.",
      "",
      "| | A | B |",
      "|---|:-:|:-:|",
      "| **A** |  | → *has* `\\|\\|--o{`<br>← *owns* `}\\|--\\|\\|` |",
      "| **B** | ← *has* `\\|\\|--o{`<br>→ *owns* `}\\|--\\|\\|` |  |",
    ].join("\n"),
  );
});
