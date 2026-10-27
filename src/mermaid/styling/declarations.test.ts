import assert from "node:assert/strict";
import { test } from "node:test";
import { readStyles } from "./declarations.ts";
import { frontmatterLine } from "./source.ts";

for (const eol of ["\n", "\r\n", "\r"]) {
  test(`style sources preserve ${JSON.stringify(eol)} statement and YAML lines`, async () => {
    const source = [
      "---",
      "config:",
      "  themeVariables:",
      '    primaryColor: "#ffffff"',
      "---",
      "flowchart TD",
      "  A[Thing]",
      "  style A fill:#ffffff,color:#222222",
    ].join(eol);

    const result = await readStyles(source);

    assert.deepEqual(result.directives, [
      {
        kind: "style",
        selector: "A",
        properties: { fill: "#ffffff", color: "#222222" },
        line: 8,
      },
    ]);
    assert.equal(frontmatterLine(source, ["config", "themeVariables", "primaryColor"]), 4);
  });
}

test("style cascade readers retain family-specific class and direct declarations", async () => {
  const sources = [
    "flowchart TD\nA[Thing]\nclassDef accent fill:#123456,color:#ffffff\nclass A accent\nstyle A stroke:#abcdef",
    "erDiagram\nTHING {\nstring id PK\n}\nclassDef accent fill:#123456,color:#ffffff\nclass THING accent\nstyle THING stroke:#abcdef",
    "stateDiagram-v2\nA\nclassDef accent fill:#123456,color:#ffffff\nclass A accent\nstyle A stroke:#abcdef",
  ];

  for (const source of sources) {
    const result = await readStyles(source);

    assert.deepEqual(result.unmodelled, []);

    const direct = result.directives.find((item) => item.kind === "style");

    assert(direct, source);

    assert.deepEqual(
      direct.properties,
      {
        fill: "#123456",
        color: "#ffffff",
        stroke: "#abcdef",
      },
      source,
    );
  }
});
