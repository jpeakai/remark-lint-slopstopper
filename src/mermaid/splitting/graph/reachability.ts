import { over, type Partition } from "../planning/state.ts";
import { quotientEdges } from "../projection/quotient.ts";
import { directedGraph, reachableFrom } from "./directed.ts";
import type { WorkGraph } from "./model.ts";

// Declared loss: how many overview node pairs the overview makes reachable
// that the original never connected. A pair (A, B) is new when B is reachable
// from A in the overview, yet no original endpoint in A reaches one in B.

const endpoints = (work: WorkGraph): string[] => [
  ...new Set([...work.ids, ...work.edges.flatMap((e) => [e.source, e.target])]),
];

export const newReachablePairs = (work: WorkGraph, part: Partition): number => {
  const original = directedGraph(work.edges.map((e) => [e.source, e.target]));
  const summary = directedGraph(quotientEdges(work, part).map((e) => [e.source, e.target]));

  try {
    const inside = new Map<string, string[]>();

    for (const x of endpoints(work)) {
      const k = over(part, x);

      inside.set(k, [...(inside.get(k) ?? []), x]);
    }

    const reach = new Map<string, Set<string>>();
    const reachOf = (x: string): Set<string> => {
      const known = reach.get(x) ?? reachableFrom(original, x);

      reach.set(x, known);

      return known;
    };

    let count = 0;
    const existed = (from: string[], to: string[]): boolean =>
      from.some((u) => to.some((v) => u !== v && reachOf(u).has(v)));

    for (const [a, from] of inside) {
      count += [...reachableFrom(summary, a)].filter((b) => b !== a && !existed(from, inside.get(b) ?? [])).length;
    }

    return count;
  } finally {
    original.destroy();
    summary.destroy();
  }
};
