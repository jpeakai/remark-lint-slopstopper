import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { partitionOf } from "../planning/state.ts";
import {
  cliqueGroups,
  degreeCounts,
  directedGraph,
  reachableFrom,
} from "./directed.ts";
import { buildWorkGraph } from "./model.ts";
import { newReachablePairs } from "./reachability.ts";

function graphFor(
  context: TestContext,
  pairs: Iterable<readonly [string, string]>,
) {
  const graph = directedGraph(pairs);
  context.after(() => {
    graph.destroy();
  });
  return graph;
}

test("directed multigraph retains repeated edges and counts self-loops twice", (context) => {
  const graph = graphFor(context, [
    ["a", "b"],
    ["a", "b"],
    ["b", "a"],
    ["a", "a"],
  ]);
  assert.equal(graph.edges().length, 4);
  assert.deepEqual(
    degreeCounts(graph),
    new Map([
      ["a", 5],
      ["b", 3],
    ]),
  );
  assert.deepEqual(reachableFrom(graph, "a"), new Set(["a", "b"]));
});

test("reachability follows directed nonempty paths and leaves sinks unreachable from themselves", (context) => {
  const graph = graphFor(context, [
    ["a", "b"],
    ["b", "c"],
    ["x", "y"],
  ]);
  assert.deepEqual(reachableFrom(graph, "a"), new Set(["b", "c"]));
  assert.deepEqual(reachableFrom(graph, "c"), new Set());
  assert.deepEqual(reachableFrom(graph, "x"), new Set(["y"]));
  assert.deepEqual(reachableFrom(graph, "missing"), new Set());
});

test("original string IDs survive traversal including prototype names and group keys", (context) => {
  const ids = [
    "",
    "__proto__",
    "constructor",
    "toString",
    "0",
    "\u0000group",
    "\u0001",
    "😀",
  ];
  const graph = graphFor(
    context,
    ids.slice(1).map((id, index) => [ids[index] ?? "", id]),
  );
  assert.deepEqual(new Set(degreeCounts(graph).keys()), new Set(ids));
  assert.deepEqual(reachableFrom(graph, ""), new Set(ids.slice(1)));
});

test("a self-loop reaches its own node without fabricating paths from incoming edges", (context) => {
  const graph = graphFor(context, [
    ["loop", "loop"],
    ["before", "loop"],
  ]);
  assert.deepEqual(reachableFrom(graph, "loop"), new Set(["loop"]));
  assert.deepEqual(reachableFrom(graph, "before"), new Set(["loop"]));
  assert.equal(degreeCounts(graph).get("loop"), 3);
});

test("empty graphs have no degree or reachable entries", (context) => {
  const graph = graphFor(context, []);
  assert.equal(graph.nodes().length, 0);
  assert.deepEqual(degreeCounts(graph), new Map());
  assert.deepEqual(reachableFrom(graph, ""), new Set());
});

test("deep directed chains use an iterative traversal without overflowing the call stack", (context) => {
  const graph = graphFor(
    context,
    Array.from(
      { length: 20_000 },
      (_, i) => [String(i), String(i + 1)] as const,
    ),
  );
  const reached = reachableFrom(graph, "0");
  assert.equal(reached.size, 20_000);
  assert(reached.has("20000"));
  assert(!reached.has("0"));
});

function closeVia(matrix: boolean[][], via: number): void {
  for (const row of matrix) {
    for (let to = 0; to < matrix.length; to++) {
      if (row[via] && matrix[via]?.[to]) row[to] = true;
    }
  }
}

test("directed reachability agrees with independent transitive closure across cyclic graphs", (context) => {
  const count = 7;
  for (let seed = 1; seed <= 40; seed++) {
    let random = seed;
    const matrix = Array.from({ length: count }, () =>
      Array<boolean>(count).fill(false),
    );
    const pairs: [string, string][] = [];
    for (let i = 0; i < 22; i++) {
      random = (random * 1_664_525 + 1_013_904_223) >>> 0;
      const from = random % count;
      random = (random * 1_664_525 + 1_013_904_223) >>> 0;
      const to = random % count;
      matrix[from]?.splice(to, 1, true);
      pairs.push([String(from), String(to)]);
    }
    const graph = graphFor(context, pairs);
    for (let via = 0; via < count; via++) closeVia(matrix, via);
    for (let from = 0; from < count; from++) {
      const expected = new Set(
        matrix[from]?.flatMap((hasPath, to) => (hasPath ? [String(to)] : [])),
      );
      assert.deepEqual(
        reachableFrom(graph, String(from)),
        expected,
        `seed ${seed}, source ${from}`,
      );
    }
  }
});

test("folding reports invented directed paths without counting parallel edges twice", () => {
  const ids = ["a", "b", "c", "d", "isolated"];
  const edges = [
    ["a", "b"],
    ["a", "b"],
    ["c", "d"],
  ].map(([source = "", target = ""], i) => ({ id: `e${i}`, source, target }));
  const work = buildWorkGraph(
    {
      diagram_type: "flowchart",
      nodes: ids.map((id) => ({ id, label: id, parent: null })),
      subgraphs: [],
      edges,
    },
    {
      direction: "LR",
      rows: 0,
      measured: { nodes: 5, edges: 3, subgraphs: 0, depth: 0 },
    },
  );
  const part = partitionOf([
    {
      members: ["b", "c"],
      regions: [],
      parent: null,
      tier: "T2",
      reason: "test fold",
    },
  ]);
  assert.equal(work.degree.get("a"), 2);
  assert.equal(work.degree.get("isolated"), undefined);
  assert.equal(newReachablePairs(work, partitionOf([])), 0);
  assert.equal(newReachablePairs(work, part), 1);
});

test("complete-link groups preserve clique connectivity and partition overlaps", () => {
  const pairs = new Set(["AB", "AC", "BC", "BD", "CD"]);
  const adjacent = (a: string, b: string): boolean =>
    pairs.has([a, b].sort().join(""));
  assert.deepEqual(cliqueGroups(["D", "C", "B", "A"], adjacent), [
    ["A", "B", "C"],
    ["D"],
  ]);
  assert.deepEqual(cliqueGroups(["A", "B", "C", "D"], adjacent), [
    ["A", "B", "C"],
    ["D"],
  ]);
});

test("native clustering handles empty, isolated and parser-specific identifiers", () => {
  assert.deepEqual(
    cliqueGroups([], () => false),
    [],
  );
  assert.deepEqual(
    cliqueGroups([""], () => false),
    [[""]],
  );
  assert.deepEqual(
    cliqueGroups(["n10", "n2"], () => false),
    [["n2"], ["n10"]],
  );
  assert.deepEqual(
    cliqueGroups(["__proto__", "constructor", ""], () => true),
    [["", "__proto__", "constructor"]],
  );
});
