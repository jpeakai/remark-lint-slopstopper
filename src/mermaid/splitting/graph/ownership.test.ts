import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWorkGraph } from "./model.ts";
import { aggregateOf, isJunction, ownersOf, rootOf } from "./ownership.ts";

function entities(ids: string[], pairs: [string, string][]) {
  return buildWorkGraph(
    {
      diagram_type: "er",
      subgraphs: [],
      nodes: ids.map((id) => ({ id, label: id, parent: null })),
      edges: pairs.map(([source, target], i) => ({
        id: String(i),
        source,
        target,
        identifying: true,
        ends: { from: "ONLY_ONE", to: "ZERO_OR_MORE" },
      })),
    },
    {
      direction: "LR",
      rows: 0,
      measured: {
        nodes: ids.length,
        edges: pairs.length,
        subgraphs: 0,
        depth: 0,
      },
    },
  );
}

test("ownership cycles break at one deterministic entity while retaining descendants", () => {
  const work = entities(
    ["a", "b", "c", "leaf"],
    [
      ["a", "b"],
      ["b", "c"],
      ["c", "a"],
      ["c", "leaf"],
    ],
  );

  assert.equal(ownersOf(work).has("a"), false);
  assert.equal(rootOf(work, "leaf"), "a");
  assert.deepEqual(aggregateOf(work, "a"), ["a", "b", "c", "leaf"]);
  assert.deepEqual(aggregateOf(work, "b"), ["b", "c", "leaf"]);
});

test("ambiguous identifying parents keep junctions outside either aggregate", () => {
  const work = entities(
    ["left", "right", "junction", "leaf"],
    [
      ["left", "junction"],
      ["right", "junction"],
      ["junction", "leaf"],
    ],
  );

  assert.equal(ownersOf(work).has("junction"), false);
  assert.equal(isJunction(work, "junction"), true);
  assert.equal(rootOf(work, "leaf"), "junction");
  assert.deepEqual(aggregateOf(work, "left"), ["left"]);
  assert.deepEqual(aggregateOf(work, "junction"), ["junction", "leaf"]);
});

test("native compound hierarchy preserves an empty root and prototype-named entities", () => {
  const work = entities(
    ["", "__proto__", "constructor"],
    [
      ["", "__proto__"],
      ["__proto__", "constructor"],
    ],
  );

  assert.equal(rootOf(work, "constructor"), "");
  assert.deepEqual(aggregateOf(work, ""), ["", "__proto__", "constructor"]);
});
