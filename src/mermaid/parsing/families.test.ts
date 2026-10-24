import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateComplexity, thresholdsFrom } from "../complexity/metrics.ts";
import { type DiagramStats, extractStats } from "./statistics.ts";

const score = (stats: DiagramStats) =>
  calculateComplexity(stats, thresholdsFrom({})).visual_complexity_score;

test("all four official railroad grammars count repeated visible boxes separately", async () => {
  for (const source of [
    'railroad-beta\nmain = sequence(terminal("x"), terminal("x"));',
    'railroad-ebnf-beta\nmain = "x" "x";',
    'railroad-abnf-beta\nmain = "x" "x";',
    'railroad-peg-beta\nmain <- "x" "x";',
  ]) {
    const stats = await extractStats(source);
    assert.equal(stats.error, null, source);
    assert.equal(stats.nodes, 2, source);
    assert.equal(new Set(stats.node_ids).size, 2, source);
    assert.equal(stats.edges, 1, source);
    assert.equal(stats.subgraphs, 0, source);
    assert.equal(stats.rows, 0, source);
    assert.equal(score(stats), 2.5, source);
  }
});

test("railroad branching and loop paths contribute to the unchanged VCS formula", async () => {
  const source =
    'railroad-beta\nmain = sequence(terminal("x"), optional(choice(nonterminal("x"), zeroOrMore(special("y")))));';
  const stats = await extractStats(source);
  assert.equal(stats.error, null);
  assert.equal(stats.nodes, 3);
  assert.equal(stats.edges, 12);
  assert.equal(stats.max_tree_depth, 3);
  assert.equal(stats.max_subgraph_depth, 0);
  assert.equal(score(stats), 11.7);
});

test("Cynefin counts its five visible domains, clipped badges and non-self transitions", async () => {
  const source =
    'cynefin-beta\ncomplex\n"Work"\n"Work"\nconfusion\n"One"\n"Two"\n"Three"\n"Four"\n"Five"\ncomplex --> clear: "Move"\ncomplex --> complex: "Stay"';
  const stats = await extractStats(source);
  assert.equal(stats.error, null);
  assert.equal(stats.nodes, 6);
  assert.equal(stats.subgraphs, 5);
  assert.equal(stats.max_subgraph_depth, 1);
  assert.equal(stats.edges, 1);
  assert.equal(stats.rows, 0);
  assert.ok(stats.node_ids.includes("confusion/overflow"));
  assert.equal(score(stats), 23.65);
});

test("an empty Cynefin framework still measures all five rendered regions", async () => {
  const stats = await extractStats(
    "cynefin-beta\ncomplex\ncomplicated\nclear\nchaotic",
  );
  assert.equal(stats.error, null);
  assert.equal(stats.nodes, 0);
  assert.equal(stats.subgraphs, 5);
  assert.equal(score(stats), 16.5);
});

test("Event Modeling infers cross-lane edges and preserves reset-frame behavior without SVG measurement", async () => {
  const stats = await extractStats(
    "eventmodeling\ntf 01 ui CartUI\ntf 02 ui CheckoutUI\ntf 03 cmd AddItem\nrf 04 evt Reset\ntf 05 rmo Summary\ntf 06 rmo Summary",
  );
  assert.equal(stats.error, null);
  assert.equal(stats.parser_used, "langium");
  assert.equal(stats.nodes, 6);
  assert.equal(stats.subgraphs, 3);
  assert.equal(stats.edges, 3);
  assert.equal(stats.max_subgraph_depth, 1);
  assert.equal(stats.rows, 0);
  assert.equal(score(stats), 18.15);
});

test("Event Modeling explicit fan-in overrides inference and frontmatter is preprocessed officially", async () => {
  const source =
    "---\ntitle: Event flow\n---\neventmodeling\ntf 01 cmd Add\ntf 02 evt Added\ntf 03 evt Removed\ntf 04 rmo Overview ->> 02 ->> 03\ntf 05 ui Display ->> 04";
  const stats = await extractStats(source);
  assert.equal(stats.error, null);
  assert.equal(stats.nodes, 5);
  assert.equal(stats.edges, 5);
  assert.equal(stats.subgraphs, 3);
});

test("Event Modeling counts the pinned renderer qualified-name lane allocation", async () => {
  const stats = await extractStats(
    "eventmodeling\ntf 01 ui Shop.Cart\ntf 02 ui Shop.Cart\ntf 03 cmd Shop.Add",
  );
  assert.equal(stats.error, null);
  assert.equal(stats.nodes, 3);
  assert.equal(stats.subgraphs, 3);
  assert.equal(stats.edges, 2);
});

test("malformed new-family diagrams retain actual official parser errors", async () => {
  for (const source of [
    "railroad-beta\nmain = terminal(",
    "cynefin-beta\ncomplex -->",
    "eventmodeling\ntf 01 invalid Entity",
  ]) {
    const stats = await extractStats(source);
    assert.ok(stats.error, source);
    assert.doesNotMatch(stats.error, /no core adapter/);
  }
});
