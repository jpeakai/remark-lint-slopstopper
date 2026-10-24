import assert from "node:assert/strict";
import { test } from "node:test";
import { frontmatterLine, sourceLines } from "./source.ts";

const lines = (...rows: string[]): string => rows.join("\n");

test("a parsed line that matches one source line is placed on it", () => {
  const place = sourceLines(
    lines("flowchart LR", "  A-->B", "  B-->C"),
    lines("flowchart LR", "A-->B", "B-->C"),
  );
  assert.equal(place(1), 1);
  assert.equal(place(3), 3);
});

test("a line past the parsed text is not placed", () => {
  const place = sourceLines("flowchart LR\nA", "flowchart LR\nA");
  assert.equal(place(3), null);
});

test("parsed lines are placed below the frontmatter", () => {
  const source = lines("---", "title: x", "---", "flowchart LR", "A");
  assert.equal(sourceLines(source, lines("flowchart LR", "A"))(2), 5);
});

test("an edited line between anchors is placed by position when none were dropped", () => {
  const place = sourceLines(
    lines("flowchart LR", "A-->B", "style A fill:#fff", "B-->C"),
    lines("flowchart LR", "A-->B", "style A fill:#ffffff", "B-->C"),
  );
  assert.equal(place(3), 3);
});

test("an edited first line is placed by position from the frontmatter", () => {
  const source = lines("---", "title: x", "---", "flowchart  LR", "A-->B");
  assert.equal(sourceLines(source, lines("flowchart LR", "A-->B"))(1), 4);
});

test("an edited line after dropped lines is placed by its shared keyword", () => {
  const source = lines(
    "flowchart LR",
    "%% comment",
    "style A fill:#fff",
    "B-->C",
  );
  const place = sourceLines(
    source,
    lines("flowchart LR", "style A fill:#ffffff", "B-->C"),
  );
  assert.equal(place(2, 5), 3);
  assert.equal(place(2), null);
});

test("the shared keyword is measured past the parsed line's indent", () => {
  const source = lines("flowchart LR", "%% comment", "style A fill:#fff", "Z");
  const place = sourceLines(
    source,
    lines("flowchart LR", "    style A fill:#ffffff", "Z"),
  );
  assert.equal(place(2, 9), 3);
  assert.equal(place(2, 4), null);
});

test("a line two source lines could be is not placed", () => {
  const place = sourceLines(lines("flowchart LR", "A", "A"), "flowchart LR\nA");
  assert.equal(place(2, 1), null);
});

test("an edited line no source line shares the keyword with is not placed", () => {
  const place = sourceLines(
    lines("flowchart LR", "%% one", "%% two", "B"),
    lines("flowchart LR", "style A fill:#fff", "B"),
  );
  assert.equal(place(2, 5), null);
});

test("CRLF and CR sources place lines as LF sources do", () => {
  for (const eol of ["\r\n", "\r"]) {
    const source = ["flowchart LR", "A-->B", "style A fill:#fff"].join(eol);
    assert.equal(
      sourceLines(source, "flowchart LR\nA-->B\nstyle A fill:#fff")(3),
      3,
    );
  }
});

test("frontmatterLine finds a nested key's source line", () => {
  const source = lines(
    "---",
    "title: x",
    "config:",
    "  theme: dark",
    "---",
    "flowchart LR",
  );
  assert.equal(frontmatterLine(source, ["config", "theme"]), 4);
  assert.equal(frontmatterLine(source, ["title"]), 2);
});

test("frontmatterLine answers null for a key the frontmatter does not set", () => {
  const source = lines("---", "title: x", "---", "flowchart LR");
  assert.equal(frontmatterLine(source, ["config"]), null);
  assert.equal(frontmatterLine(source, ["title", "deeper"]), null);
  assert.equal(frontmatterLine(source, []), null);
});

test("frontmatterLine answers null for a diagram with no frontmatter", () => {
  assert.equal(frontmatterLine("flowchart LR\nA", ["title"]), null);
});
