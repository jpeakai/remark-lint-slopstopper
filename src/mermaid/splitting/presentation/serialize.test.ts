import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type DiagramGraph,
  extractGraph,
  type GraphEdge,
} from "../../parsing/graph.ts";
import { buildWorkGraph } from "../graph/model.ts";
import { emitSource } from "./serialize.ts";

const byId = <T extends { id: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.id.localeCompare(b.id));
const edgeFacts = (edges: GraphEdge[]) =>
  edges
    .map(({ id: _, ...facts }) => facts)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
function facts(graph: DiagramGraph) {
  return {
    nodes: byId(graph.nodes),
    regions: byId(graph.subgraphs),
    edges: edgeFacts(graph.edges),
    markers: byId(graph.pseudo?.nodes ?? []),
    transitions: edgeFacts(graph.pseudo?.edges ?? []),
  };
}

test("state serialization preserves composite ownership when generated region IDs collide", async () => {
  const graph = await extractGraph(
    'stateDiagram-v2\nstate "Composite" as A {\n[*] --> B\nB --> C: progress\nC --> [*]\n}\nA__group\nA__group --> A: enter',
  );
  const work = buildWorkGraph(graph, {
    direction: "TB",
    rows: 0,
    measured: { nodes: 4, edges: 2, subgraphs: 1, depth: 1 },
  });
  const owned = work.regions.get("A__group_");
  assert.equal(owned?.owner, "A");
  assert.equal(owned?.label, "Composite");
  assert.equal(work.nodes.get("A")?.owns, "A__group_");
  const source = emitSource(
    { family: "state", type: graph.diagram_type, direction: "TB" },
    { graph, stubs: new Set() },
  );
  assert.deepEqual(facts(await extractGraph(source)), facts(graph));
});

test("each emitted scene owns its ordering without mutating or retaining graph state", async () => {
  const graph = await extractGraph("flowchart TD\nA-->B\nA-->C\nC-->A");
  const original = structuredClone(graph);
  const head = {
    family: "flowchart" as const,
    type: graph.diagram_type,
    direction: "TD",
  };
  const plain = emitSource(head, { graph, stubs: new Set() });
  const stubbed = emitSource(head, { graph, stubs: new Set(["A"]) });
  assert.notEqual(stubbed, plain);
  assert.equal(emitSource(head, { graph, stubs: new Set() }), plain);
  assert.equal(
    emitSource(head, {
      graph: {
        ...graph,
        nodes: [...graph.nodes].reverse(),
        edges: [...graph.edges].reverse(),
      },
      stubs: new Set(),
    }),
    plain,
  );
  assert.deepEqual(graph, original);
});

const roundTrips = async (source: string, direction = "TB"): Promise<void> => {
  const graph = await extractGraph(source);
  const family = graph.diagram_type === "er" ? "er" : "flowchart";
  const emitted = emitSource(
    { family, type: graph.diagram_type, direction },
    { graph, stubs: new Set() },
  );
  assert.deepEqual(facts(await extractGraph(emitted)), facts(graph));
};

test("erDiagram emission keeps entities, attribute rows, labels and cardinalities", async () => {
  await roundTrips(
    'erDiagram\nCUSTOMER["Customer account"] {\nstring name\nint age\n}\nORDER\nCUSTOMER ||--o{ ORDER : places\nORDER }|..|{ LINE : "has lines"',
  );
});

test("a flowchart shape with no bracket is written as shape data", async () => {
  await roundTrips(
    'flowchart TD\nA@{ shape: hourglass }\nB@{ shape: bolt, label: "Strike now" }\nC@{ shape: hourglass, label: "`**Bold** text`" }\nA --> B\nB --> C',
  );
});
