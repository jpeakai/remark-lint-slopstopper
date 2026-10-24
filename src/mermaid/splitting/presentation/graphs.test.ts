import assert from "node:assert/strict";
import { test } from "node:test";
import { configFromPreset } from "../../complexity/metrics.ts";
import { extractGraph } from "../../parsing/graph.ts";
import { type SplitPlan, splitOutcome } from "../index.ts";

const config = configFromPreset("low-density");
const chain = (prefix: string, n: number): string =>
  Array.from(
    { length: n },
    (_, i) => `${prefix}${i} --> ${prefix}${i + 1}`,
  ).join("\n");
const tail = "b4 --> Y\nY --> Z\nZ --> W\nW --> V";
// Two author regions, Alpha (a0..a3) and Beta (b0..b4), joined as given.
const clusters = (joins: string): string =>
  `flowchart TD\nsubgraph A[Alpha]\n${chain("a", 3)}\nend\nsubgraph B[Beta]\n${chain("b", 4)}\nend\n${joins}\nX --> a0\n${tail}`;

// An emitted diagram read back by labels: each edge as "from -> to", start
// and end markers as [*], each box as its label and the labels it holds.
async function drawn(source: string) {
  const graph = await extractGraph(source);
  const named = new Map(
    [...graph.nodes, ...graph.subgraphs].map((n) => [n.id, n.label]),
  );
  for (const m of graph.pseudo?.nodes ?? [])
    named.set(m.id, m.shape === "lollipop" ? `()${m.label}` : "[*]");
  const name = (id: string): string => named.get(id) ?? id;
  return {
    edges: [...graph.edges, ...(graph.pseudo?.edges ?? [])]
      .map(
        (e) =>
          `${name(e.source)} -> ${name(e.target)}${e.label ? `: ${e.label}` : ""}`,
      )
      .sort(),
    boxes: Object.fromEntries(
      graph.subgraphs.map((s) => [
        s.label,
        graph.nodes
          .filter((n) => n.parent === s.id)
          .map((n) => n.label)
          .sort(),
      ]),
    ),
  };
}

async function planOf(source: string): Promise<SplitPlan> {
  const outcome = await splitOutcome(source, config);
  assert.deepEqual(outcome.violations, []);
  assert.ok(outcome.plan, outcome.reason);
  return outcome.plan;
}

const detailHolding = (plan: SplitPlan, id: string) => {
  const detail = plan.details.find((d) =>
    d.graph.nodes.some((n) => n.id === id && !(n.id in d.stubs)),
  );
  assert.ok(detail, `no detail holds ${id}`);
  return detail;
};

test("stubs for several members of one other group are drawn in a box named after it", async () => {
  const plan = await planOf(clusters("a1 --> b1\na2 --> b2\na3 --> b3"));
  const alpha = await drawn(detailHolding(plan, "a0").source);
  assert.deepEqual(alpha.boxes, {
    Alpha: ["a0", "a1", "a2", "a3"],
    "Beta (+5)": ["b1", "b2", "b3"],
  });
  assert.deepEqual(
    alpha.edges.filter((e) => e.includes("b")),
    ["a1 -> b1", "a2 -> b2", "a3 -> b3"],
  );
  const beta = await drawn(detailHolding(plan, "b0").source);
  assert.deepEqual(
    beta.edges.filter((e) => e.startsWith("Alpha")),
    ["Alpha (+4) -> b1", "Alpha (+4) -> b2", "Alpha (+4) -> b3"],
  );
});

test("edges from one member into several of another group are drawn exactly by the target", async () => {
  const plan = await planOf(clusters("a1 --> b1\na1 --> b2\na1 --> b3"));
  const alpha = await drawn(detailHolding(plan, "a0").source);
  assert.deepEqual(
    alpha.edges.filter((e) => e.includes("Beta")),
    ["a1 -> Beta (+5)"],
  );
  const beta = await drawn(detailHolding(plan, "b0").source);
  assert.deepEqual(
    beta.edges.filter((e) => e.startsWith("a1")),
    [
      "a1 (in Alpha (+4)) -> b1",
      "a1 (in Alpha (+4)) -> b2",
      "a1 (in Alpha (+4)) -> b3",
    ],
  );
});

test("groups joined both ways are drawn whole on one side and member by member on the other", async () => {
  const plan = await planOf(clusters("a1 --> b1\nb3 --> a2"));
  const overview = await drawn(plan.overviewSource);
  assert.ok(overview.edges.includes("Alpha (+4) -> Beta (+5)"));
  assert.ok(overview.edges.includes("Beta (+5) -> Alpha (+4)"));
  const alpha = await drawn(detailHolding(plan, "a0").source);
  assert.deepEqual(alpha.boxes["Beta (+5)"], ["b1", "b3"]);
  const beta = await drawn(detailHolding(plan, "b0").source);
  assert.deepEqual(
    beta.edges.filter((e) => e.includes("Alpha")),
    ["Alpha (+4) -> b1", "b3 -> Alpha (+4)"],
  );
});

test("state markers are merged onto groups in the overview and drawn as written in details", async () => {
  const plan = await planOf(
    `stateDiagram-v2\n[*] --> S0\n${chain("S", 12)}\nS12 --> C\nstate C {\n[*] --> I0\n${chain("I", 8)}\nI8 --> [*]\n}\nC --> T0\n${chain("T", 6)}\nT6 --> [*]\nS3 --> [*]\nS5 --> [*]: quit`,
  );
  // S3 and S5 end in one group, so their two end transitions draw as one,
  // unlabelled since only one of them carries "quit".
  assert.equal(plan.loss.mergedMarkers, 1);
  const overview = await drawn(plan.overviewSource);
  assert.deepEqual(
    overview.edges.filter((e) => e.includes("[*]")),
    ["S1 (+6) -> [*]", "T6 -> [*]", "[*] -> S0"],
  );
  const middle = await drawn(detailHolding(plan, "S5").source);
  assert.deepEqual(
    middle.edges.filter((e) => e.includes("[*]")),
    ["S3 -> [*]", "S5 -> [*]: quit"],
  );
  const composite = plan.details.find((d) => d.split);
  assert.ok(composite?.split);
  const inner = await drawn(composite.split.overviewSource);
  assert.ok(inner.edges.includes("[*] -> I0"));
  assert.ok(inner.edges.includes("I8 -> [*]"));
});

test("class interfaces follow their class and nested namespaces stay nested", async () => {
  const classes = (prefix: string, n: number): string =>
    Array.from({ length: n }, (_, i) => `class ${prefix}${i}`).join("\n");
  const plan = await planOf(
    `classDiagram\nnamespace Outer {\n${classes("J", 7)}\n}\nnamespace Outer.Inner {\n${classes("K", 6)}\n}\n${chain("J", 6)}\n${chain("K", 5)}\nJ6 --> K0\nK5 --> L0\n${chain("L", 4)}\nK2 --() Port`,
  );
  const overview = await drawn(plan.overviewSource);
  assert.ok(overview.edges.includes("Outer (+13) -> ()Port"));
  const outer = plan.details[0];
  assert.ok(outer?.split);
  const nested = await drawn(outer.split.overviewSource);
  assert.ok(nested.edges.includes("K2 -> ()Port"));
  const parsed = await extractGraph(outer.split.overviewSource);
  assert.deepEqual(
    parsed.subgraphs.map((s) => [s.id, s.parent]),
    [
      ["Outer", null],
      ["Outer.Inner", "Outer"],
    ],
  );
});
