import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { diagramSources, exampleNames, pngDimensions, scenarios, svgDimensions } from "./render.ts";

// A PNG's signature followed by an IHDR chunk header for the given size.
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);

  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);

  return bytes;
}

test("PNG validation reads IHDR dimensions and rejects empty or foreign files", () => {
  assert.deepEqual(pngDimensions(pngHeader(640, 480)), { width: 640, height: 480 });
  assert.throws(() => pngDimensions(pngHeader(0, 480)), /empty dimensions 0x480/);
  assert.throws(() => pngDimensions(new TextEncoder().encode("<svg></svg> padding padding")), /signature/);
  assert.throws(() => pngDimensions(new Uint8Array()), /signature/);

  const wrongChunk = pngHeader(1, 1);

  wrongChunk.set([0x49, 0x44, 0x41, 0x54], 12);
  assert.throws(() => pngDimensions(wrongChunk), /IHDR/);
});

test("SVG validation accepts absolute sizes or a viewBox and rejects empty geometry", () => {
  assert.deepEqual(svgDimensions('<svg width="120" height="40px"/>'), { width: 120, height: 40 });
  assert.deepEqual(svgDimensions('<svg width="100%" viewBox="-8 -8 300.5 90"><g/></svg>'), {
    width: 300.5,
    height: 90,
  });
  assert.throws(() => svgDimensions('<svg viewBox="0 0 0 90"/>'), /no positive dimensions/);
  assert.throws(() => svgDimensions('<svg width="100%"/>'), /no positive dimensions/);
  assert.throws(() => svgDimensions("<html><body/></html>"), /root element/);
  assert.throws(() => svgDimensions(""), /root element/);
});

test("expected artifacts come from actual Mermaid fences only", () => {
  const markdown = [
    "# Two diagrams",
    "",
    "```mermaid",
    "flowchart TD",
    "  A --> B",
    "```",
    "",
    "```text",
    "```mermaid",
    "not a diagram",
    "```",
    "",
    "```Mermaid",
    "pie",
    '  "A": 1',
    "```",
  ].join("\n");

  const sources = diagramSources(markdown);

  assert.deepEqual(
    sources.map(({ index, line, source }) => ({ index, line, source })),
    [
      { index: 1, line: 3, source: "flowchart TD\n  A --> B" },
      { index: 2, line: 13, source: 'pie\n  "A": 1' },
    ],
  );
  assert.match(sources[0]?.sha256 ?? "", /^[0-9a-f]{64}$/);
});

test("each fence expands to two themes, three backgrounds and two formats", () => {
  const sources = diagramSources("```mermaid\npie\n```\n\n```mermaid\npie\n```\n");

  const matrix = scenarios("01-pie", sources);

  assert.equal(matrix.length, 24);
  assert.equal(new Set(matrix.map((scenario) => scenario.id)).size, 24);
  assert.ok(matrix.some((scenario) => scenario.id === "01-pie#2/dark/transparent/svg"));
  assert.deepEqual(scenarios("01-pie", []), []);
});

test("example selection rejects paths, unknown folders and empty trees", async (t) => {
  const scratch = new URL("../../tmp/", import.meta.url);

  await mkdir(scratch, { recursive: true });

  const root = await mkdtemp(join(scratch.pathname, "render-selection-"));

  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "examples", "02-b"), { recursive: true });
  await mkdir(join(root, "examples", "01-a"), { recursive: true });
  await mkdir(join(root, "examples", "scripts"), { recursive: true });

  assert.deepEqual(await exampleNames(root), ["01-a", "02-b"]);
  assert.deepEqual(await exampleNames(root, ["examples/02-b/"]), ["02-b"]);

  for (const name of ["../01-a", "missing", ".", ".."]) {
    await assert.rejects(exampleNames(root, [name]), /Expected an example folder|Unknown example/);
  }

  await rm(join(root, "examples"), { recursive: true });
  await mkdir(join(root, "examples"));
  await assert.rejects(exampleNames(root), /No examples found/);
});

test("the matched matrix renders each theme on its own page colour only", () => {
  const sources = diagramSources("```mermaid\npie\n```\n");

  const matched = scenarios("01-pie", sources, "matched");

  assert.deepEqual(
    matched.map((scenario) => scenario.id),
    ["01-pie#1/light/white/png", "01-pie#1/light/white/svg", "01-pie#1/dark/black/png", "01-pie#1/dark/black/svg"],
  );
  assert.equal(scenarios("01-pie", sources, "full").length, 12);
});
