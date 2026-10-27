import assert from "node:assert/strict";
import { test } from "node:test";
import { createLanguageView } from "./language-view.ts";

test("language construction and text reads do not load NLP; concurrent requests share one computation", async () => {
  let requests = 0;
  const view = createLanguageView(
    () => "A sentence.",
    async () => {
      requests++;

      return [];
    },
  );

  assert.equal(requests, 0);
  assert.equal(view.text, "A sentence.");
  assert.equal(view.requested, false);
  assert.equal(requests, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(view)), {
    text: "A sentence.",
    requested: false,
  });
  assert.equal(requests, 0);

  const first = view.sentences;
  const second = view.sentences;

  assert.equal(first, second);
  await Promise.all([first, second]);

  assert.equal(requests, 1);
  assert.equal(view.requested, true);
});

test("official Compromise terms retain verb lemmas and clause hints", async () => {
  const view = createLanguageView(() => "The parser reads requests because the worker validates inputs.");

  const sentences = await view.sentences;

  assert.equal(sentences.length, 1);
  assert.ok(sentences[0]?.terms.has("read"));
  assert.ok(sentences[0]?.terms.has("validate"));
  assert.ok((sentences[0]?.clauses ?? 0) >= 2);
});
