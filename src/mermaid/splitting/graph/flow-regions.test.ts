import assert from "node:assert/strict";
import { test } from "node:test";
import { dominates, immediateDominators } from "./flow-regions.ts";

const nextOf =
  (pairs: readonly (readonly [string, string])[]) => (id: string) =>
    pairs.filter(([from]) => from === id).map(([, to]) => to);

test("library dominators preserve diamonds, cycles and unreachable nodes", () => {
  const ids = ["root", "a", "b", "join", "tail", "island"];
  const next = nextOf([
    ["root", "a"],
    ["root", "b"],
    ["a", "join"],
    ["b", "join"],
    ["join", "tail"],
    ["tail", "join"],
  ]);
  const tree = immediateDominators("root", ids, next);
  assert.deepEqual(
    tree,
    new Map([
      ["root", "root"],
      ["a", "root"],
      ["b", "root"],
      ["join", "root"],
      ["tail", "join"],
    ]),
  );
  assert.equal(dominates(tree, "join", "tail"), true);
  assert.equal(dominates(tree, "a", "tail"), false);
  assert.equal(dominates(tree, "root", "island"), false);
});

test("dominator IDs retain empty, prototype and virtual entry identifiers", () => {
  const ids = ["", "__proto__", "constructor", "\u0000entry", "tail"];
  const pairs = ids.slice(1).map((id, i) => [ids[i] ?? "", id] as const);
  const tree = immediateDominators("", ids, nextOf(pairs));
  assert.equal(tree.get(""), "");
  for (const [from, to] of pairs) assert.equal(tree.get(to), from);
});

test("deep dominator trees use library traversal without recursive stack overflow", () => {
  const ids = Array.from({ length: 20_001 }, (_, i) => String(i));
  const tree = immediateDominators("0", ids, (id) =>
    Number(id) < 20_000 ? [String(Number(id) + 1)] : [],
  );
  assert.equal(tree.size, 20_001);
  assert.equal(tree.get("20000"), "19999");
});
