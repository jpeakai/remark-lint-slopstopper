import assert from "node:assert/strict";
import { test } from "node:test";
import { extractGraph } from "../../parsing/graph.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { flowOrder } from "./ranking.ts";

const orderOf = async (source: string): Promise<Array<[string, number]>> => {
  const graph = await extractGraph(source);
  const work = buildWorkGraph(graph, {
    direction: "TB",
    rows: 0,
    measured: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      subgraphs: graph.subgraphs.length,
      depth: 0,
    },
  });
  return [...flowOrder(work)].sort(([a], [b]) => a.localeCompare(b));
};

test("flow ranks use shortest distance from all entries without inventing disconnected cycle entries", async () => {
  assert.deepEqual(
    await orderOf(
      "flowchart TB\nA-->C\nB-->D\nC-->E\nD-->E\nE-->E\nX-->Y\nY-->X\nZ",
    ),
    [
      ["A", 0],
      ["B", 0],
      ["C", 1],
      ["D", 1],
      ["E", 2],
      ["Z", 0],
    ],
  );
});

test("state start markers select the entry into a directed cycle", async () => {
  assert.deepEqual(
    await orderOf("stateDiagram-v2\n[*]-->B\nA-->B\nB-->C\nC-->A"),
    [
      ["A", 2],
      ["B", 0],
      ["C", 1],
    ],
  );
});
