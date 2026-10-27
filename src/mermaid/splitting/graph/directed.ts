import cytoscape, { type Core, type ElementDefinition, type NodeCollection, type NodeSingular } from "cytoscape";
import { byNatural } from "./order.ts";

// Nodes and edges share an ID namespace. Encoding also preserves empty IDs and
// keeps original parser identifiers separate from the library's graph keys.
export const nodeKey = (id: string): string => `node:${JSON.stringify(id)}`;

// A multigraph keeps repeated relationships and counts a self-loop twice in
// total degree.
export function directedGraph(pairs: Iterable<readonly [string, string]>, vertices: Iterable<string> = []): Core {
  const nodes = new Map<string, ElementDefinition>(
    Array.from(vertices, (id) => [nodeKey(id), { data: { id: nodeKey(id), originalId: id } }]),
  );
  const edges: ElementDefinition[] = [];

  for (const [source, target] of pairs) {
    for (const id of [source, target]) {
      nodes.set(nodeKey(id), { data: { id: nodeKey(id), originalId: id } });
    }

    edges.push({
      data: {
        id: `edge:${edges.length}`,
        source: nodeKey(source),
        target: nodeKey(target),
      },
    });
  }

  const graph = cytoscape({
    headless: true,
    styleEnabled: false,
  });

  // Initialise the empty headless core, then add data without running a layout.
  graph.add([...nodes.values(), ...edges]);

  return graph;
}

// Reachability means a nonempty directed path. The traversal includes its root
// unconditionally, so restore it only when a self-loop or cycle reaches it.
export function reachableFrom(graph: Core, start: string): Set<string> {
  const reached = new Set<string>();
  const root = graph.getElementById(nodeKey(start));

  if (root.empty()) {
    return reached;
  }

  graph.elements().dfs({
    roots: root,
    directed: true,
    visit: (node) => {
      if (node.id() !== root.id()) {
        reached.add(node.data("originalId") as string);
      }
    },
  });

  if (
    root
      .incomers("node")
      .map((node) => node.data("originalId") as string)
      .some((id) => id === start || reached.has(id))
  ) {
    reached.add(start);
  }

  return reached;
}

export function degreeCounts(graph: Core): Map<string, number> {
  return new Map(graph.nodes().map((node) => [node.data("originalId") as string, node.degree(true)]));
}

// Complete linkage admits a merge only when every cross-pair is adjacent.
// Sorting vertices fixes tie order. The result partitions the vertices into
// disjoint cliques; overlapping maximal cliques are not enumerated.
export function cliqueGroups(vertices: readonly string[], adjacent: (a: string, b: string) => boolean): string[][] {
  if (vertices.length === 0) {
    return [];
  }

  const graph = directedGraph([], [...vertices].sort(byNatural));

  try {
    const distance = (a: NodeSingular, b: NodeSingular): number =>
      adjacent(a.data("originalId") as string, b.data("originalId") as string) ? 0 : 1;

    // Cytoscape 3.34.4 returns NodeCollection[] in threshold mode. Its bundled
    // declaration incorrectly wraps this array in a `clusters` property.
    const groups = graph.nodes().hierarchicalClustering({
      distance,
      linkage: "max",
      mode: "threshold",
      threshold: 0.5,
    }) as unknown as NodeCollection[];

    return groups.map((group) => group.map((node) => node.data("originalId") as string).sort(byNatural));
  } finally {
    graph.destroy();
  }
}
