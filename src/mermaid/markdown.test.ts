import assert from "node:assert/strict";
import { test } from "node:test";
import { createDocument } from "../document/context.ts";
import { fences, sourceLocation } from "./markdown.ts";

for (const eol of ["\n", "\r\n", "\r"]) {
  test(`Mermaid source ranges respect ${JSON.stringify(eol)} line endings`, () => {
    const lines = [
      "# Heading 🧭",
      "",
      "```mermaid",
      "flowchart LR",
      "  A[Label]",
      "  style A fill:#ffffff,color:#ffffff",
      "```",
      "",
      "Following paragraph.",
    ];
    const source = lines.join(eol);
    const [node] = fences(createDocument(source));
    assert.ok(node);
    const at = source.indexOf("  style A");
    assert.deepEqual(sourceLocation(source, node, 3), {
      start: at,
      end: at + (lines[5]?.length ?? 0),
    });
    const end = sourceLocation(source, node, 50);
    assert.ok(end.start <= node.end);
    assert.ok(end.end <= node.end);
  });
}
