import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dottedFamily,
  FAN_LISTED,
  familyLabel,
  fanLabel,
  groupLabels,
  htmlEntities,
  laneLabel,
  listedOthers,
  pairLabel,
  quoted,
  quoteLabel,
  rangeEnds,
  rangeLabel,
  shorten,
  sourceEntities,
  spanEnds,
  spanLabel,
  stageWord,
  tail,
} from "./text.ts";

const LONG = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH";

test("entity markers restore source or HTML syntax", () => {
  assert.equal(sourceEntities("ﬂ°quot¶ßxﬂ°°35¶ß"), "#quot;x#35;");
  assert.equal(htmlEntities("ﬂ°amp¶ß ﬂ°°35¶ß"), "&amp; &#35;");
});

test("a long label is cut in the middle, markup never", () => {
  assert.equal(shorten(LONG), "abcdefghijklmnopqrstuvwxyz0…6789ABCDEFGH");
  assert.equal(shorten("Short label"), "Short label");
  assert.equal(shorten(`*${LONG}`), `*${LONG}`);
  assert.equal(shorten(LONG, true), LONG);
});

test("a range label names the first and last in natural order", () => {
  assert.equal(rangeLabel(["Step 10", "Step 2", "Step 9"]), "Step 2 … Step 10");
  assert.equal(rangeLabel(["Step 1", "Step 2"]), null);
  assert.equal(rangeLabel(["A", "A", "A"]), null);
  assert.equal(rangeLabel(["a", "b", "<c>"]), null);
  assert.equal(rangeLabel(["Step 1", "Step 2", "Step 9"], ["Step 5"]), null);
  assert.equal(rangeLabel([`${LONG}1`, `${LONG}2`, `${LONG}3`]), null);
});

test("a family label needs one namespace held whole", () => {
  assert.equal(dottedFamily(" gold.daily "), "gold");
  assert.equal(familyLabel(["gold.a", "gold.b", "gold.c"], []), "gold.*");
  assert.equal(familyLabel(["gold.a", "gold.b", "gold.c"], ["gold.x"]), null);
  assert.equal(familyLabel(["gold.a", "silver.b", "gold.c"], []), null);
  assert.equal(familyLabel(["gold.a", "gold.b"], []), null);
  assert.equal(familyLabel(["a", "b", "c"], []), null);
});

test("a stage word is a namespace, else a first word", () => {
  assert.equal(stageWord("gold.orders"), "gold");
  assert.equal(stageWord("Order service"), "Order");
  assert.equal(stageWord("single"), null);
});

test("a lane label names each stage of twin chains", () => {
  assert.equal(
    laneLabel([
      ["Extract orders", "bronze.orders"],
      ["Extract users", "bronze.users"],
    ]),
    "Extract → bronze",
  );
  assert.equal(
    laneLabel([
      ["Extract a", "x1"],
      ["Ingest b", "x2"],
    ]),
    "Extract/Ingest → …",
  );
  assert.equal(
    laneLabel([
      ["a1", "b1"],
      ["c1", "d1"],
    ]),
    null,
  );
  assert.equal(laneLabel([["Extract a", "Load b"]]), null);
  assert.equal(laneLabel([["Extract a", "Load b"], ["Extract c"]]), null);
  assert.equal(
    laneLabel([
      [`${LONG} a`, `${LONG} b`],
      [`${LONG} c`, `${LONG} d`],
    ]),
    null,
  );
});

test("a fan label names the node the leaves hang from", () => {
  assert.equal(fanLabel("Order service", true), "Order service → …");
  assert.equal(fanLabel("Order service", false), "… → Order service");
  assert.equal(fanLabel("  ", true), null);
  assert.equal(fanLabel("a*b", true), null);
  assert.equal(fanLabel(LONG, true), null);
});

test("a span label joins the entry and the exit", () => {
  assert.equal(spanLabel("git push", "tsc"), "git push → tsc");
  assert.equal(spanLabel("a", "a"), null);
  assert.equal(spanLabel(" a", "b"), null);
  assert.equal(spanLabel("a → b", "c"), null);
  assert.equal(spanLabel(LONG, "b"), null);
});

test("a pair label names both members", () => {
  assert.equal(pairLabel("ROOM", "BUILDING"), "ROOM (+BUILDING)");
  assert.equal(pairLabel("ROOM", "12"), null);
  assert.equal(pairLabel("ROOM", "ROOM"), null);
  assert.equal(pairLabel("ROOM", "(x)"), null);
  assert.equal(pairLabel(LONG, "BUILDING"), null);
});

test("a list names every other member within its limits", () => {
  assert.equal(
    listedOthers("ADDRESS", ["COUNTRY", "ADDRESS", "CITY"]),
    "CITY, COUNTRY",
  );
  assert.equal(listedOthers("ZIP", ["CITY", "COUNTRY"]), null);
  assert.equal(listedOthers("A", ["A", "B, C", "D"]), null);
  assert.equal(listedOthers("A", ["A", "B", "C", "D"]), null);
  assert.equal(listedOthers("A", ["A", "B", "C", "D"], FAN_LISTED), "B, C, D");
  assert.equal(listedOthers("A", ["A", "B", "B"]), null);
});

test("group labels offer the cut, the whole and the tagged label", () => {
  assert.deepEqual(groupLabels({ base: "X", n: 0, pair: "Y" }, "g1"), [
    "X (+Y)",
  ]);
  assert.deepEqual(groupLabels({ base: "Base", n: 3 }, "g1"), [
    "Base (+3)",
    "Base (+3) [g1]",
  ]);
  assert.deepEqual(groupLabels({ base: LONG, n: 2 }, "g2"), [
    "abcdefghijklmnopqrstuvwxyz0…6789ABCDEFGH (+2)",
    `${LONG} (+2)`,
    "abcdefghijklmnopqrstuvwxyz0…6789ABCDEFGH (+2) [g2]",
  ]);
});

test("range and span ends read back their two labels", () => {
  assert.deepEqual(rangeEnds("a … b"), ["a", "b"]);
  assert.deepEqual(rangeEnds("a"), []);
  assert.deepEqual(spanEnds("a → b"), ["a", "b"]);
  assert.deepEqual(spanEnds("a"), []);
});

test("labels are quoted or written at a line end", () => {
  assert.equal(quoteLabel('say "hi"\nnext'), "say #quot;hi#quot;<br>next");
  assert.equal(quoted("x", true), '"`x`"');
  assert.equal(quoted('a"b', undefined), '"a#quot;b"');
  assert.equal(tail(undefined), "");
  assert.equal(tail("a &lt; b &gt; c"), " : a < b > c");
  assert.equal(tail("l1\r\nl2"), " : l1<br>l2");
});
