import type { DiagramGraph, GraphEdge } from "../../parsing/graph.ts";
// Deterministic text and tuple ordering shared by readers and planners.
export const byText = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

export const sorted = (xs: Iterable<string>): string[] => [...xs].sort(byText);

// Natural order, as a reader counts: n2 before n10. The collator compares
// digit runs by value; ties fall back to code unit order, so the order is total.
const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "variant",
});
export const byNatural = (a: string, b: string): number =>
  collator.compare(a, b) || byText(a, b);

export const byNaturalTuple = (
  a: readonly string[],
  b: readonly string[],
): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = byNatural(a[i] ?? "", b[i] ?? "");
    if (c !== 0) return c;
  }
  return a.length - b.length;
};

// Compares two sorted id tuples element by element, then by length.
export const byTuple = (a: readonly string[], b: readonly string[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const c = byText(a[i] ?? "", b[i] ?? "");
    if (c !== 0) return c;
  }
  return a.length - b.length;
};

export const byId = (a: { id: string }, b: { id: string }): number =>
  byNatural(a.id, b.id);

// Where a walk may start, in turn: start markers, then the diagram's own
// nodes, then its stubs, each in natural order of ids.
export const startOrder = (
  graph: DiagramGraph,
  stubs: ReadonlySet<string>,
): string[] => {
  const markers = (graph.pseudo?.nodes ?? [])
    .filter((m) => m.shape === "stateStart")
    .map((m) => m.id);
  const own = [
    ...graph.nodes.map((n) => n.id),
    ...graph.subgraphs.map((s) => s.id),
  ].filter((id) => !stubs.has(id));
  return [
    ...markers.sort(byNatural),
    ...own.sort(byNatural),
    ...[...stubs].sort(byNatural),
  ];
};

export const ranked = (
  rank: Map<string, number>,
): ((a: { id: string }, b: { id: string }) => number) => {
  return (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0) || byId(a, b);
};

export const edgeOrder = (
  rank: Map<string, number>,
): ((a: GraphEdge, b: GraphEdge) => number) => {
  const at = (id: string): number => rank.get(id) ?? -1;
  return (a, b) =>
    at(a.source) - at(b.source) ||
    at(a.target) - at(b.target) ||
    byNatural(a.source, b.source) ||
    byText(a.id, b.id);
};
