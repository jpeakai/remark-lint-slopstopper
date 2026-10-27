import assert from "node:assert/strict";
import { test } from "node:test";
import { createDocument } from "../document/context.ts";
import { analyzeMermaid, MERMAID_RULES } from "./analyze.ts";

const source = "```mermaid\nflowchart LR\nA[Invisible]\nstyle A fill:#fff,color:#fff\n```";

test("complexity-only analysis never evaluates contrast styling or canvas", async () => {
  assert.deepEqual(
    await analyzeMermaid(source, {
      rules: [MERMAID_RULES.complexity],
      canvas: { light: "invalid" },
    }),
    [],
  );
});
test("contrast-only analysis never evaluates complexity options", async () => {
  const diagnostics = await analyzeMermaid(source, {
    rules: [MERMAID_RULES.contrast],
    get complexity(): never {
      throw new Error("disabled complexity evaluated");
    },
  });

  assert.equal(diagnostics.length, 2);
  assert.ok(diagnostics.every((item) => item.ruleId === MERMAID_RULES.contrast));
});
test("actual host trees determine which fences are analyzed", async () => {
  const document = createDocument(source, {
    tree: { type: "root", children: [] },
  });

  assert.deepEqual(await analyzeMermaid(document), []);
});
test("disabling both rules skips parser failures", async () => {
  assert.deepEqual(await analyzeMermaid("```mermaid\nnot valid Mermaid\n```", { rules: [] }), []);
});

test("prose-only selections skip Mermaid parser failures", async () => {
  assert.deepEqual(
    await analyzeMermaid("```mermaid\nnot valid Mermaid\n```", {
      rules: ["prose/sentence-one-per-line"],
    }),
    [],
  );
});
