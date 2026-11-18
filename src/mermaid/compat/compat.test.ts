import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { adaptKanban, adaptQuadrantChart } from "../parsing/adapters/collections.ts";
import { getMermaidCore } from "../parsing/engine.ts";
import { cynefinProjection, treemapProjection } from "../parsing/projections.ts";
import { diagramFromText } from "./api.ts";
import { finite, flag, getter, IncompatibleMermaidShape, identifier, list, listGetter } from "./shapes.ts";
import type { SequenceDB } from "./types.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

test("getters run on their own database, so receiver-dependent getters work", () => {
  class Database {
    private readonly items = ["a", "b"];

    getItems() {
      return this.items;
    }
  }

  assert.deepEqual(listGetter(new Database(), "getItems"), ["a", "b"]);
});

test("a missing getter or wrong shape is an incompatible shape, never an empty result", () => {
  assert.throws(() => getter({}, "getRels"), IncompatibleMermaidShape);
  assert.throws(() => getter({}, "getRels"), /changed shape: its database getRels is undefined, expected a getter/);
  assert.throws(() => listGetter({ getRels: () => null }, "getRels"), /getRels\(\) is null, expected an array/);
  assert.throws(() => list({}, "plots"), /plots is object, expected an array/);
  assert.throws(() => finite(Number.NaN, "value"), /expected a finite number/);
  assert.throws(() => identifier("", "id"), /expected a non-empty identifier/);
  assert.throws(() => flag("true", "visible"), /expected a boolean/);
  assert.equal(finite(3, "value"), 3);
});

test("statistics adapters reject malformed databases instead of counting nothing", () => {
  assert.throws(() => adaptKanban({ getData: () => ({}) }), /getData\(\)\.nodes is undefined, expected an array/);
  assert.throws(
    () => adaptQuadrantChart({ getQuadrantData: () => ({ quadrants: [] }) }),
    /getQuadrantData\(\)\.points is undefined/,
  );
});

// Mermaid's own databases are the oracle for each public-AST projection.
const core = async (source: string) => diagramFromText(await getMermaidCore(), source);
const tree = (node: { name: string; value?: number; children?: unknown[] }): unknown => ({
  name: node.name,
  ...(node.value === undefined ? {} : { value: node.value }),
  children: (node.children ?? []).map((child) => tree(child as typeof node)),
});

test("the treemap projection nests rows as Mermaid's database does", async () => {
  for (const source of [
    'treemap-beta\n"Root"\n  "Leaf A": 10\n  "Branch"\n    "Leaf B": 5\n"Second": 3',
    'treemap-beta\n"A"\n    "deep": 1\n  "shallow": 2\n"B"\n  "C"\n      "D": 4',
  ]) {
    const diagram = await core(source);
    const native = (diagram.db as unknown as { getRoot(): { children: [] } }).getRoot().children.map(tree);

    assert.deepEqual((await treemapProjection(diagram.text)).map(tree), native, source);
  }
});

test("the cynefin projection keeps replacement, skipped self-loops and absent labels", async () => {
  const source =
    'cynefin-beta\ncomplex\n  "Old"\ncomplex\n  "New"\nconfusion\n  "a"\n  "b"\n  "c"\n  "d"\ncomplex --> complex : "loop"\nclear --> chaotic';

  const diagram = await core(source);
  const db = diagram.db as unknown as { getDomains(): Map<string, unknown>; getTransitions(): unknown[] };

  const view = await cynefinProjection(diagram.text);

  assert.deepEqual([...view.getDomains()], [...db.getDomains()]);
  assert.deepEqual(view.getTransitions(), db.getTransitions());
  assert.deepEqual(view.getDomains().get("complex")?.items, [{ label: "New" }]);
});

test("sequence actors share their participant group's identity with getBoxes", async () => {
  const diagram = await core("sequenceDiagram\n  box Aqua Shop\n  participant A\n  participant B\n  end\n  A->>B: hi");
  const db = diagram.db as unknown as SequenceDB;
  const [box] = db.getBoxes();

  assert.ok(box);
  assert.ok([...db.getActors().values()].every((actor) => actor.box === box));
});

// Every TypeScript file below a directory.
async function sources(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

const COMPAT = `${join("mermaid", "compat")}/`;

test("only the compat layer imports Mermaid's distribution or its deprecated API", async () => {
  const files = [...(await sources(join(ROOT, "src"))), ...(await sources(join(ROOT, "examples", "scripts")))];
  const offenders: string[] = [];

  for (const path of files.filter((file) => !file.includes(COMPAT))) {
    if (/from "mermaid\/dist\/|\.mermaidAPI\b/.test(await readFile(path, "utf8"))) {
      offenders.push(relative(ROOT, path));
    }
  }

  assert.ok(files.length > 50, "the scan reaches the source tree");
  assert.deepEqual(offenders, []);
});
