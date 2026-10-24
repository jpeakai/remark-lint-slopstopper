import assert from "node:assert/strict";
import { test } from "node:test";
import { labelBag, plainText } from "./stems.ts";

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
