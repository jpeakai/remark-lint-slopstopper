import assert from "node:assert/strict";
import { test } from "node:test";
import {
  crossesStages,
  labelBag,
  mixesFamilies,
  oneFamily,
  plainText,
  similarity,
  stageOf,
  statusFamilies,
} from "./stems.ts";

test("label text preserves breaks, encoded entities and literal comparison signs", () => {
  assert.equal(
    plainText('<b>Read</b><br title="x > y"/>Write<BR>Queue &amp; cache'),
    "Read Write Queue & cache",
  );
  assert.equal(
    plainText("Cost &lt; 5 and size &gt; 2"),
    "Cost < 5 and size > 2",
  );
  assert.equal(plainText("ﬂ°quot¶ßValueﬂ°quot¶ß ﬂ°°35¶ß"), '"Value" #');
  assert.equal(plainText("left<!-- hidden -->right"), "leftright");
});

test("label parsing remains independent of Mermaid's browser initialisation", async () => {
  assert.equal(plainText("Before<br>After"), "Before After");
  const { getMermaidCore } = await import("../../parsing/engine.ts");
  const core = await getMermaidCore();
  await core.parse("flowchart LR\nA[Read] --> B[Write]");
  assert.equal(plainText("Before<br>After"), "Before After");
  assert.deepEqual(
    labelBag("<b>Orders</b> service", "node"),
    new Set(["order", "servic"]),
  );
});

test("role words weigh a quarter in label similarity", () => {
  const order = labelBag("Order service", "a");
  assert.equal(similarity(order, labelBag("Orders DB", "b")), 2 / 3);
  assert.equal(similarity(order, labelBag("Payment service", "c")), 1 / 9);
  assert.equal(similarity(new Set(), new Set()), 0);
  assert.deepEqual(labelBag("A12", "x"), new Set());
});

test("a stage is a namespace, an id prefix or an id stem", () => {
  assert.equal(stageOf("bronze.orders", "x"), "bronze");
  assert.equal(stageOf("PLAT-1201 Fix login", "x"), "plat");
  assert.equal(stageOf("Orders", "br_orders"), "br");
  assert.equal(stageOf("10002 Backlog", "n1"), null);
});

test("statuses sharing one stem form a status family", () => {
  assert.deepEqual(
    statusFamilies(
      new Map([
        ["a", "10008 Ready for Release"],
        ["b", "10009 Released"],
        ["c", "10010 Backlog"],
        ["d", "PLAT-12 Released"],
        ["e", "Released"],
      ]),
    ),
    new Map([
      ["a", "~releas"],
      ["b", "~releas"],
    ]),
  );
});

test("family predicates compare named families only", () => {
  assert.equal(crossesStages(["a", null], ["b"]), true);
  assert.equal(crossesStages(["a"], ["a", "b"]), false);
  assert.equal(crossesStages([null], ["b"]), false);
  assert.equal(mixesFamilies(["a", "b", null]), true);
  assert.equal(mixesFamilies(["a", "a", null]), false);
  assert.equal(oneFamily(["a"], ["a"]), true);
  assert.equal(oneFamily(["a"], ["b"]), false);
  assert.equal(oneFamily([null], ["a"]), false);
});
