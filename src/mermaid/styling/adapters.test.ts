import assert from "node:assert/strict";
import { test } from "node:test";
import { READERS } from "./adapters.ts";
import { readStyles } from "./declarations.ts";

test("a flowchart's default linkStyle is its own directive and every edge inherits it", async () => {
  const result = await readStyles(
    [
      "flowchart LR",
      "A-->B",
      "B-->C",
      "linkStyle default stroke:#ff0000",
      "linkStyle 1 color:#00ff00",
    ].join("\n"),
  );
  assert.deepEqual(result, {
    directives: [
      {
        kind: "linkStyle",
        selector: "default",
        properties: { stroke: "#ff0000" },
        line: 4,
      },
      {
        kind: "linkStyle",
        selector: "1",
        properties: { stroke: "#ff0000", color: "#00ff00", fill: "none" },
        line: 5,
      },
    ],
    unmodelled: [],
  });
});

test("a flowchart edge linkStyle with no default stands alone", async () => {
  const result = await readStyles(
    "flowchart LR\nA-->B\nlinkStyle 0 stroke:#ff0000",
  );
  assert.deepEqual(result.directives, [
    {
      kind: "linkStyle",
      selector: "0",
      properties: { stroke: "#ff0000", fill: "none" },
      line: 3,
    },
  ]);
});

test("a classDiagram reports its classDefs and only the classes a style statement styles", async () => {
  const result = await readStyles(
    [
      "classDiagram",
      "class Animal",
      "class Dog",
      "classDef hot fill:#ff0000",
      "style Dog fill:#00ff00,color:#000000",
      'cssClass "Animal" hot',
    ].join("\n"),
  );
  assert.deepEqual(result, {
    directives: [
      {
        kind: "classDef",
        selector: "hot",
        properties: { fill: "#ff0000" },
        line: 4,
      },
      {
        kind: "style",
        selector: "Dog",
        properties: { fill: "#00ff00", color: "#000000" },
        line: 5,
      },
    ],
    unmodelled: [],
  });
});

test("a state classDef's statement holds only the styles it added", async () => {
  const result = await readStyles(
    "stateDiagram-v2\nA\nclassDef hot fill:#ff0000\nclassDef hot color:#ffffff\nclass A hot",
  );
  assert.deepEqual(result.directives, [
    {
      kind: "classDef",
      selector: "hot",
      properties: { fill: "#ff0000", color: "#ffffff" },
      line: 3,
    },
  ]);
});

test("every flowchart and state alias shares one reader", () => {
  assert.equal(READERS["flowchart-v2"], READERS.flowchart);
  assert.equal(READERS["flowchart-elk"], READERS.flowchart);
  assert.equal(READERS.stateDiagram, READERS.state);
  assert.equal(READERS.classDiagram, READERS.class);
});
