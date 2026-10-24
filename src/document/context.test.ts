import assert from "node:assert/strict";
import { test } from "node:test";
import type { Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { VFile } from "vfile";
import { analyzeProse } from "../prose/analyze.ts";
import remarkSlopstopper from "../remark/plugin.ts";
import { createDocument } from "./context.ts";

test("the supplied remark tree retains lazy language on every paragraph and text node", async () => {
  const source =
    "# Title\n\n> Quote sentence.\n\n- Parent sentence.\n  - Child sentence with [link text](https://example.test).\n\n| Column |\n| --- |\n| Cell sentence. |";
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source);
  const document = createDocument(source, { tree });
  assert.equal(document.tree, tree);
  const covered: string[] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "paragraph" || node.type === "text") {
      assert.ok(node.data?.language);
      assert.equal(node.data.language.requested, false);
      covered.push(node.type);
    }
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(tree);
  assert.equal(
    covered.length,
    document.paragraphs.length + document.textNodes.length,
  );
  assert.ok(document.textNodes.some((node) => node.value === "Cell sentence."));
  assert.ok(document.textNodes.some((node) => node.value === "Title"));
  const cell = document.textNodes.find(
    (node) => node.value === "Cell sentence.",
  );
  assert.ok(cell?.data?.language);
  assert.equal((await cell.data.language.sentences)[0]?.text, "Cell sentence.");
  assert.ok(
    document.paragraphs.some((paragraph) =>
      paragraph.ancestors.some((node) => node.type === "blockquote"),
    ),
  );
});

test("a fresh document context observes changes to an existing host tree", async () => {
  const source = "First sentence. Second sentence.";
  const tree = unified().use(remarkParse).parse(source);
  const original = createDocument(source, { tree });
  const paragraph = original.paragraphs[0]?.node;
  assert.ok(paragraph);
  const before = original.language(paragraph);
  assert.equal((await before.sentences).length, 2);
  const text = paragraph.children.find((node) => node.type === "text");
  assert.ok(text);
  text.value = "One sentence.";
  const current = createDocument(source, { tree });
  const after = current.language(paragraph);
  assert.notEqual(after, before);
  assert.equal((await after.sentences).length, 1);
  assert.equal(paragraph.data?.language, after);
});

test("disabling prose policies leaves every NLP view unrequested", async () => {
  const document = createDocument(
    "A sentence. Another sentence.\n\n| Cell |\n| --- |\n| More sentences. Another one. |",
  );
  assert.deepEqual(await analyzeProse(document, { rules: [] }), []);
  for (const paragraph of document.paragraphs)
    assert.equal(document.language(paragraph.node).requested, false);
  for (const node of document.textNodes)
    assert.equal(document.language(node).requested, false);
});

test("separate prose policies reuse the same paragraph analysis promise", async () => {
  const document = createDocument(
    "The parser reads Markdown. The parser produces nodes. Those nodes carry positions. The server stores requests. Requests contain user messages. The server validates messages.",
  );
  const paragraph = document.paragraphs[0];
  assert.ok(paragraph);
  const view = document.language(paragraph.node);
  assert.equal(view.requested, false);
  const word = await analyzeProse(document, {
    maxWords: 2,
    rules: ["prose/sentence-word-budget-exceeded"],
  });
  const first = view.sentences;
  const paragraphFindings = await analyzeProse(document, {
    rules: ["prose/paragraph-sentence-budget-exceeded"],
  });
  assert.equal(view.sentences, first);
  assert.equal(view.requested, true);
  assert.ok(word.length);
  assert.equal(paragraphFindings.length, 1);
  assert.ok(
    document.textNodes.every((node) => !document.language(node).requested),
  );
});

test("table text stays queryable although prose rules exempt table cells", async () => {
  const document = createDocument(
    "| Column |\n| --- |\n| First sentence. Second sentence. |",
  );
  assert.deepEqual(await analyzeProse(document), []);
  const text = document.textNodes.find((node) =>
    node.value.startsWith("First"),
  );
  assert.ok(text);
  const sentences = await document.language(text).sentences;
  assert.equal(sentences.length, 2);
});

test("following remark plugins receive language views on reparsed fixer-round nodes", async () => {
  const trees: Root[] = [];
  const source =
    "First sentence. Second sentence.\n\n> Quote paragraph.\n\nA hard\\\nbreak.\n\n| Header |\n| --- |\n| Table text. |";
  const processor = unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(() => (tree: Root) => {
      trees.push(tree);
    })
    .use(remarkSlopstopper, { fix: true })
    .use(() => (tree: Root) => {
      trees.push(tree);
    });
  const file = await processor.process(source);
  const [initial, current] = trees;
  assert.ok(initial);
  assert.ok(current);
  assert.notEqual(initial, current);
  const initialParagraph = initial.children.find(
    (node) => node.type === "paragraph",
  );
  const currentParagraph = current.children.find(
    (node) => node.type === "paragraph",
  );
  assert.ok(initialParagraph?.data?.language);
  assert.ok(currentParagraph?.data?.language);
  assert.notEqual(
    initialParagraph.data.language,
    currentParagraph.data.language,
  );
  const document = createDocument(String(file), { tree: current });
  for (const paragraph of document.paragraphs)
    assert.equal(
      paragraph.node.data?.language,
      document.language(paragraph.node),
    );
  for (const text of document.textNodes)
    assert.equal(text.data?.language, document.language(text));
  assert.ok(document.textNodes.some((node) => node.value === "Table text."));
  assert.equal(
    String(file),
    source.replace(
      "First sentence. Second sentence.",
      "First sentence.\nSecond sentence.",
    ),
  );
});

test("reused remark processors analyze each actual host tree rather than cached source alone", async () => {
  const source = "First sentence. Second sentence.";
  const processor = unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(() => (tree: Root, file: VFile) => {
      if (file.path !== "changed.md") return;
      const paragraph = tree.children.find((node) => node.type === "paragraph");
      const text = paragraph?.children.find((node) => node.type === "text");
      if (text) text.value = "One sentence.";
    })
    .use(remarkSlopstopper, {
      rules: {
        "sentence-word-budget-exceeded": false,
        "paragraph-sentence-budget-exceeded": false,
        "contrast-text-below-aa": false,
        "complexity-visual-score-acceptable-exceeded": false,
      },
    });
  const first = await processor.process({ value: source, path: "normal.md" });
  const second = await processor.process({ value: source, path: "changed.md" });
  assert.equal(first.messages.length, 1);
  assert.deepEqual(second.messages, []);
});
