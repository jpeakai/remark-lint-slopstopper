import assert from "node:assert/strict";
import { test } from "node:test";
import { extractGraph } from "./graph.ts";
import { extractStats } from "./statistics.ts";

const fixtures = [
  "flowchart TD\nsubgraph Group\nA[One] --> B[Two]\nend",
  "classDiagram\nclass A {\n+name\n+run()\n}\nA --> B",
  "erDiagram\nA ||--o{ B : contains\nA {\nstring id PK\n}",
  "sequenceDiagram\nbox Group\nparticipant A\nend\nparticipant B\nA->>B: message",
  "mindmap\n  root((Root))\n    Child\n      Leaf",
  "stateDiagram-v2\nstate Active {\nIdle --> Busy\n}",
];

test("graph projections and canonical stats agree across supported parser families", async () => {
  for (const source of fixtures) {
    const stats = await extractStats(source);

    assert.equal(stats.error, null, source);

    const graph = await extractGraph(source);

    assert.equal(graph.nodes.length, stats.nodes, source);
    assert.equal(graph.edges.length, stats.edges, source);
    assert.equal(graph.subgraphs.length, stats.subgraphs, source);

    const ids = new Set([...graph.nodes, ...graph.subgraphs].map((node) => node.id));

    for (const node of [...graph.nodes, ...graph.subgraphs]) {
      if (node.parent !== null) {
        assert(ids.has(node.parent), source);
      }
    }
  }
});

test("treeView depth follows actual parents across differently indented branches", async () => {
  const stats = await extractStats("treeView-beta\nRoot\n    A\n        Leaf\n  B\n      Other");

  assert.equal(stats.error, null);
  assert.equal(stats.nodes, 6);
  assert.equal(stats.edges, 5);
  assert.equal(stats.max_tree_depth, 3);
});

test("treemap styling statements contribute no visible nodes or edges", async () => {
  const source = 'treemap-beta\n"Root"\n  "Leaf": 1';

  const plain = await extractStats(source);

  const styled = await extractStats(`${source}\nclassDef bad fill:#fff,color:#fff`);

  assert.deepEqual(styled, plain);
  assert.equal(styled.nodes, 2);
});

test("treeView uses official box-drawing preprocessing and counts repeated labels", async () => {
  const stats = await extractStats("treeView-beta\nRoot\n├── file\n└── file");

  assert.equal(stats.error, null);
  assert.equal(stats.nodes, 4);
  assert.equal(stats.edges, 3);
  assert.equal(stats.max_tree_depth, 2);
  assert.equal(new Set(stats.node_ids).size, 4);
});

test("treemap counts repeated labels as distinct rendered boxes", async () => {
  const stats = await extractStats('treemap-beta\n"Root"\n  "Leaf": 1\n  "Leaf": 2');

  assert.equal(stats.error, null);
  assert.equal(stats.nodes, 3);
  assert.equal(stats.edges, 2);
  assert.equal(new Set(stats.node_ids).size, 3);
});

test("Ishikawa bookkeeping retains the labels supplied by the official parser", async () => {
  const stats = await extractStats("ishikawa-beta\n  Effect\n    Cause");

  assert.equal(stats.error, null);
  assert.deepEqual(stats.node_ids, ["Cause", "Effect"]);
});

test("state composite group IDs cannot collide with authored state IDs", async () => {
  const graph = await extractGraph("stateDiagram-v2\nstate A {\nB\n}\nA__group\nA__group_");
  const all = [...graph.nodes, ...graph.subgraphs];

  assert.equal(new Set(all.map((node) => node.id)).size, all.length);

  const group = graph.subgraphs[0];

  assert(group);

  assert.equal(group.id, "A__group__");
  assert.equal(group.owner, "A");
  assert.equal(graph.nodes.find((node) => node.id === "B")?.parent, group.id);
  assert.equal(graph.nodes.find((node) => node.id === "A__group")?.parent, null);
});

test("parser caches return independent graph and stats snapshots", async () => {
  const source = "flowchart TD\n__proto__ --> constructor";

  const graph = await extractGraph(source);

  graph.nodes[0]?.rows?.push("mutated");
  graph.nodes.splice(0);

  const stats = await extractStats(source);

  stats.node_ids.splice(0);

  assert.deepEqual((await extractStats(source)).node_ids, ["__proto__", "constructor"]);
  assert.equal((await extractGraph(source)).nodes.length, 2);
});

test("concurrent state marker aliases preserve authored IDs and transition endpoints", async () => {
  const source =
    "stateDiagram-v2\nstate Active {\n[*] --> A\n--\n[*] --> B\n}\nActive_region1_start --> Active_region2_start\nActive_region1_start_";

  const graph = await extractGraph(source);
  const all = [...graph.nodes, ...graph.subgraphs, ...(graph.pseudo?.nodes ?? [])];

  assert.equal(new Set(all.map((node) => node.id)).size, all.length);
  assert(graph.nodes.some((node) => node.id === "Active_region1_start"));
  assert(graph.nodes.some((node) => node.id === "Active_region2_start"));
  assert(graph.nodes.some((node) => node.id === "Active_region1_start_"));

  assert.deepEqual(
    graph.edges.map(({ source, target }) => [source, target]),
    [["Active_region1_start", "Active_region2_start"]],
  );
  assert.deepEqual(
    graph.pseudo?.edges.map(({ source, target }) => [source, target]),
    [
      ["Active_region1_start__", "A"],
      ["Active_region2_start_", "B"],
    ],
  );
  assert.deepEqual(await extractGraph(`${source}\n`), graph);
});
