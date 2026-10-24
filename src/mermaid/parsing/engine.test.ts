import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import {
  detectType,
  getMermaidCore,
  memoBySource,
  repairNodeGetters,
} from "./engine.ts";

// A getter read through Node.prototype, as DOMPurify reads it.
const throughNode = (win: Window, node: object, property: string): unknown =>
  Object.getOwnPropertyDescriptor(win.Node.prototype, property)?.get?.call(
    node,
  );

test("repaired Node.prototype getters dispatch to each node's own class", () => {
  const win = new Window();
  repairNodeGetters(win);
  const div = win.document.createElement("div");
  div.textContent = "label";
  const text = win.document.createTextNode("words");
  assert.equal(throughNode(win, div, "nodeName"), "DIV");
  assert.equal(throughNode(win, div, "textContent"), "label");
  assert.equal(throughNode(win, text, "nodeValue"), "words");
  assert.equal(throughNode(win, text, "nodeName"), "#text");
});

test("a repaired getter on a node with no override runs Node's own getter", () => {
  const win = new Window();
  repairNodeGetters(win);
  const bare = Object.create(win.Node.prototype) as object;
  assert.equal(throughNode(win, bare, "nodeValue"), null);
});

test("a prototype without the getters is left as it is", () => {
  const prototype = {};
  repairNodeGetters({ Node: { prototype } });
  assert.deepEqual(Object.getOwnPropertyNames(prototype), []);
});

test("memoBySource reads each source once and hands out independent copies", async () => {
  let reads = 0;
  const memo = memoBySource(async (source) => ({ source, read: ++reads }));
  const first = await memo("a");
  first.source = "changed";
  assert.deepEqual(await memo("a"), { source: "a", read: 1 });
  assert.deepEqual(await memo("b"), { source: "b", read: 2 });
});

test("memoBySource forgets its oldest source past 512 sources", async () => {
  let reads = 0;
  const memo = memoBySource(async (source) => ({ source, read: ++reads }));
  await memo("oldest");
  for (let i = 0; i < 512; i++) await memo(`source ${i}`);
  assert.deepEqual(await memo("source 511"), {
    source: "source 511",
    read: 513,
  });
  assert.deepEqual(await memo("oldest"), { source: "oldest", read: 514 });
});

test("detectType names a diagram past its frontmatter", () => {
  assert.equal(
    detectType("---\ntitle: T\n---\nflowchart LR\nA-->B"),
    "flowchart-v2",
  );
  assert.equal(detectType("sequenceDiagram\nA->>B: hi"), "sequence");
});

test("detectType answers null when mermaid detects no diagram", () => {
  assert.equal(detectType("not a diagram"), null);
});

test("a zenuml diagram is detected and fails to load with the reason", async () => {
  assert.equal(detectType("zenuml\nA.b()"), "zenuml");
  const mermaid = await getMermaidCore();
  await assert.rejects(mermaid.parse("zenuml\nA.b()"), {
    message:
      "zenuml is drawn by an external mermaid add-on that is not installed",
  });
});

// The CSS object of the window the shim installs before mermaid loads.
const shimCss = (): {
  supports: (property: string, value?: string) => boolean;
} => (globalThis as unknown as { window: Window }).window.CSS;

test("the shim's CSS.supports accepts only real colours for color", async () => {
  await getMermaidCore();
  assert.equal(shimCss().supports("color", "#ff0000"), true);
  assert.equal(shimCss().supports("color", "rebeccapurple"), true);
  assert.equal(shimCss().supports("color", "Shop"), false);
});

test("the shim's CSS.supports defers other checks to happy-dom", async () => {
  await getMermaidCore();
  assert.equal(shimCss().supports("display", "flex"), true);
  assert.equal(shimCss().supports("display: flex"), true);
});
