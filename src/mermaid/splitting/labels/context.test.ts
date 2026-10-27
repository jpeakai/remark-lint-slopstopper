import assert from "node:assert/strict";
import { test } from "node:test";
import { extractGraph } from "../../parsing/graph.ts";
import { buildWorkGraph, type WorkGraph } from "../graph/model.ts";
import { partitionOf } from "../planning/state.ts";
import {
  fromMembers,
  type LabelContext,
  labelStubs,
  memberText,
  ownSuffices,
  readerOf,
  readingsOf,
} from "./context.ts";

const workOf = async (source: string): Promise<WorkGraph> =>
  buildWorkGraph(await extractGraph(source), {
    direction: "TB",
    rows: 0,
    measured: { nodes: 0, edges: 0, subgraphs: 0, depth: 0 },
  });

// ORDER and LINE fold into one group named after ORDER; Y is outside.
const SOURCE = "flowchart TB\nO[ORDER]-->L[LINE]\nL-->Y[Other]\nY-->Z[Other]";
const KEY = "\u0000L";

const contextOf = async (): Promise<LabelContext> => {
  const work = await workOf(SOURCE);
  const part = partitionOf([
    {
      members: ["L", "O"],
      regions: [],
      parent: null,
      tier: "T4",
      reason: "aggregate",
    },
  ]);
  const groups = new Map([[KEY, { id: "g1", base: "ORDER", label: "ORDER (+1)" }]]);

  return { work, part, groups };
};

const readerFor = (ctx: LabelContext) =>
  readerOf(ctx.work, [...ctx.groups.values()], (id) => (ctx.part.groupOf.has(id) ? "g1" : undefined));

test("a member's own label suffices when the group label names it", () => {
  const g = { label: "ORDER (+1)", base: "ORDER" };

  assert.equal(ownSuffices(g, "ORDER", false), true);
  assert.equal(ownSuffices(g, "ORDER", true), false);
  assert.equal(ownSuffices(g, "LINE", false), false);
  assert.equal(ownSuffices({ ...g, paired: "LINE" }, "LINE", false), true);

  const span = { label: "a → b (+1)", base: "a → b", spanned: true };

  assert.equal(ownSuffices(span, "b", false), true);
  assert.equal(ownSuffices(span, "b", true), false);

  const range = { label: "S1 … S9 (+1)", base: "S1 … S9" };

  assert.equal(ownSuffices(range, "S9", false), true);
  assert.equal(ownSuffices({ ...range, markdown: true }, "S9", false), false);
});

test("a member reads by its own label or inside its group's label", async () => {
  const ctx = await contextOf();

  assert.equal(memberText(ctx, "O"), "ORDER");
  assert.equal(memberText(ctx, "L"), "LINE (in ORDER (+1))");
  assert.equal(memberText(ctx, "Y"), "Other");
  assert.equal(memberText(ctx, KEY), "ORDER (+1)");
  assert.equal(memberText(ctx, "\u0000missing"), "\u0000missing");
});

test("each form a stub's text takes has its readings", async () => {
  const ctx = await contextOf();
  const r = readerFor(ctx);

  assert.deepEqual(readingsOf(r, "Other"), new Set(["Y", "Z"]));
  assert.deepEqual(readingsOf(r, "Other [Z]"), new Set(["Z"]));
  assert.deepEqual(readingsOf(r, "Other [O]"), new Set());
  assert.deepEqual(readingsOf(r, "ORDER (+1)"), new Set(["g1"]));
  assert.deepEqual(readingsOf(r, "LINE (in ORDER (+1))"), new Set(["L"]));
  assert.deepEqual(readingsOf(r, "LINE (in Other)"), new Set());
  assert.deepEqual(readingsOf(r, "ORDER (+1) from LINE"), new Set(["g1"]));
  assert.deepEqual(fromMembers(r, "ORDER (+1) from LINE", "g1"), ["L"]);
  assert.deepEqual(fromMembers(r, "ORDER (+1) from Other", "g1"), []);
  assert.deepEqual(fromMembers(r, "LINE", "g1"), []);
});

test("an ambiguous stub text is tagged with its endpoint", async () => {
  const ctx = await contextOf();
  const texts = labelStubs(ctx, [{ id: "s1", endpoint: "Z" }], () => []);

  assert.deepEqual(texts.get("s1"), { label: "Other [Z]", endpoint: "Z" });
});

const groupBesideNamesake = async (sources: string[]) => {
  const ctx = await contextOf();
  const texts = labelStubs(
    ctx,
    [
      { id: "s1", endpoint: KEY },
      { id: "s2", endpoint: "O" },
    ],
    (stub) => (stub === "s1" ? sources : []),
  );

  return [texts.get("s1")?.label, texts.get("s2")?.label];
};

test("a group stub beside its namesake names the member its edges leave", async () => {
  assert.deepEqual(await groupBesideNamesake(["L"]), ["ORDER (+1) from LINE", "ORDER"]);
});

test("a group stub keeps its label when no one member can name it", async () => {
  assert.deepEqual(await groupBesideNamesake(["O"]), ["ORDER (+1)", "ORDER"]);
  assert.deepEqual(await groupBesideNamesake(["L", "O"]), ["ORDER (+1)", "ORDER"]);
  assert.deepEqual(await groupBesideNamesake([]), ["ORDER (+1)", "ORDER"]);
  assert.deepEqual(await groupBesideNamesake(["missing"]), ["ORDER (+1)", "ORDER"]);
});

test("stubs that would still show one text keep their plain texts", async () => {
  const ctx = await contextOf();
  const texts = labelStubs(
    ctx,
    [
      { id: "s1", endpoint: KEY },
      { id: "s3", endpoint: KEY },
    ],
    () => ["L"],
  );

  assert.deepEqual(
    [...texts.values()].map((t) => t.label),
    ["ORDER (+1)", "ORDER (+1)"],
  );
});
