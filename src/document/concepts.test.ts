import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Root } from "mdast";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { analyzeProse } from "../prose/analyze.ts";
import remarkStopslop from "../remark/plugin.ts";
import { conceptVocabulary } from "./concepts.ts";
import { createDocument } from "./context.ts";

test("only concept headings teach nouns; tables, definitions and code examples are ignored", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "stopslop-concepts-"));
  try {
    await writeFile(
      join(cwd, "CONCEPTS.md"),
      [
        "# Concepts",
        "",
        "## Group",
        "",
        "### **CAN**",
        "",
        "A transport envelope.",
        "",
        "### `Work Bundle`",
        "",
        "A durable unit.",
        "",
        "| Term | Definition |",
        "| --- | --- |",
        "| MAY | A routing record. |",
        "| Empty | |",
        "",
        "| Status | Description |",
        "| --- | --- |",
        "| Hidden | Not a term table. |",
        "",
        "```md",
        "## Example",
        "Not a definition.",
        "```",
      ].join("\n"),
    );
    assert.deepEqual(await conceptVocabulary(cwd)(), {
      can: "Noun",
      "work bundle": "Noun",
    });
    const document = createDocument(
      "can handles requests. may stores records.",
      { cwd },
    );
    const paragraph = document.paragraphs[0];
    assert.ok(paragraph);
    const sentences = await document.language(paragraph.node).sentences;
    assert.ok(sentences.some((sentence) => sentence.terms.has("can")));
    assert.equal(
      sentences.some((sentence) => sentence.terms.has("may")),
      false,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("concurrent project vocabularies do not mutate Compromise globally", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "stopslop-concepts-"));
  const empty = await mkdtemp(join(tmpdir(), "stopslop-empty-"));
  try {
    await writeFile(
      join(cwd, "CONCEPTS.md"),
      "## CAN\n\nA transport envelope.\n",
    );
    const read = async (directory: string): Promise<boolean> => {
      const doc = createDocument("can handles requests.", { cwd: directory });
      const paragraph = doc.paragraphs[0];
      assert.ok(paragraph);
      return (await doc.language(paragraph.node).sentences).some((s) =>
        s.terms.has("can"),
      );
    };
    assert.deepEqual(await Promise.all([read(cwd), read(empty), read(cwd)]), [
      true,
      false,
      true,
    ]);
    assert.equal(await read(empty), false);
  } finally {
    await Promise.all([
      rm(cwd, { recursive: true, force: true }),
      rm(empty, { recursive: true, force: true }),
    ]);
  }
});

test("vocabulary reads are lazy, shared per context, and refreshed for new contexts", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "stopslop-concepts-"));
  try {
    const document = createDocument(
      "can handles requests.\n\nmay stores records.",
      { cwd },
    );
    await writeFile(
      join(cwd, "CONCEPTS.md"),
      "## CAN\n\nA transport envelope.\n",
    );
    const first = document.paragraphs[0],
      second = document.paragraphs[1];
    assert.ok(first && second);
    assert.ok(
      (await document.language(first.node).sentences)[0]?.terms.has("can"),
    );
    await writeFile(join(cwd, "CONCEPTS.md"), "## MAY\n\nA routing record.\n");
    assert.equal(
      (await document.language(second.node).sentences)[0]?.terms.has("may"),
      false,
    );
    const fresh = createDocument("may stores records.", { cwd });
    const paragraph = fresh.paragraphs[0];
    assert.ok(paragraph);
    assert.ok(
      (await fresh.language(paragraph.node).sentences)[0]?.terms.has("may"),
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("absent concepts are optional while real file access failures remain visible", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "stopslop-concepts-"));
  try {
    assert.deepEqual(await conceptVocabulary(cwd)(), {});
    const file = join(cwd, "not-a-directory");
    await writeFile(file, "content");
    await assert.rejects(conceptVocabulary(file)(), { code: "ENOTDIR" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("remark uses VFile.cwd and keeps project vocabulary on reparsed fixer nodes", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "stopslop-concepts-"));
  try {
    await writeFile(
      join(cwd, "CONCEPTS.md"),
      "## CAN\n\nA transport envelope.\n",
    );
    let recognized = false;
    const processor = unified()
      .use(remarkParse)
      .use(remarkStringify)
      .use(remarkStopslop, {
        fix: true,
        rules: {
          "contrast-text-below-aa": false,
          "complexity-visual-score-acceptable-exceeded": false,
        },
      })
      .use(() => async (tree: Root) => {
        const paragraph = tree.children.find(
          (node) => node.type === "paragraph",
        );
        assert.ok(paragraph?.data?.language);
        recognized = (await paragraph.data.language.sentences).some((s) =>
          s.terms.has("can"),
        );
      });
    const file = await processor.process({
      cwd,
      value: "can handles requests. Another sentence.",
    });
    assert.equal(recognized, true);
    assert.equal(String(file), "can handles requests.\nAnother sentence.");
    assert.equal(file.messages.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("disabled prose policies never read concepts and concurrent node requests share the vocabulary promise", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "stopslop-concepts-"));
  try {
    const invalid = join(cwd, "not-a-directory");
    await writeFile(invalid, "content");
    const document = createDocument("A sentence.", { cwd: invalid });
    assert.deepEqual(await analyzeProse(document, { rules: [] }), []);
    const paragraph = document.paragraphs[0];
    assert.ok(paragraph);
    const view = document.language(paragraph.node);
    assert.equal(view.text, "A sentence.");
    assert.equal(view.requested, false);
    await assert.rejects(view.sentences, { code: "ENOTDIR" });
    const vocabulary = conceptVocabulary(cwd);
    assert.equal(vocabulary(), vocabulary());
    await vocabulary();
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
