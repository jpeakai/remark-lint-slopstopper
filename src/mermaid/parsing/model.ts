export interface GraphNode {
  id: string;
  label: string;

  // The subgraph that holds this node, or null at the top level.
  parent: string | null;

  // The counted state represented by a separately named composite boundary.
  owner?: string;

  // The shape as mermaid's parser names it, such as "diamond" or "choice".
  shape?: string;

  // Whether the label is a markdown string, which the source writes in backticks.
  markdown?: true;

  // The rows drawn inside the node, each as the source writes it: an
  // erDiagram entity's attributes, a classDiagram class's members then methods.
  rows?: string[];

  // A stateDiagram composite's concurrency regions, when it has two or more.
  regions?: number;

  // A stateDiagram state's description lines under its name, as stateDb
  // keeps them: each `id : text` after the first, which names the state.
  descriptions?: string[];
}

export interface GraphEdge {
  // Unique in the graph: mermaid's own id where it gives one, else the two
  // ends and how many edges between them came before, as in L_A_B_0.
  id: string;
  source: string;
  target: string;
  label?: string;

  // The connector as the source writes it, such as "-.->" or "<|--".
  kind?: string;

  // An erDiagram relationship's ends, such as "||--o{", or a classDiagram
  // relation's multiplicities, such as `"1" *-- "many"`.
  cardinality?: string;

  // An erDiagram relationship's ends by erDb's Cardinality name, such as
  // ONLY_ONE or ZERO_OR_MORE: `from` beside the source, `to` beside the target.
  ends?: { from: string; to: string };

  // Whether an erDiagram relationship is identifying, drawn as a solid line.
  identifying?: boolean;

  // Whether the label is a markdown string.
  markdown?: true;
}

export interface DiagramGraph {
  diagram_type: string;
  nodes: GraphNode[];
  edges: GraphEdge[];

  // A subgraph holds nodes, or other subgraphs through their parent.
  subgraphs: GraphNode[];

  // What is drawn but not counted: a stateDiagram's start and end markers with
  // their transitions, and a classDiagram's lollipop interfaces, which a
  // counted edge may name as an end.
  pseudo?: { nodes: GraphNode[]; edges: GraphEdge[] };
}

// Names each edge by its two ends and how many edges between them came
// before, so a name does not move when an unrelated statement does.
export const edgeIds = (): ((source: string, target: string) => string) => {
  const seen = new Map<string, number>();

  return (source, target) => {
    const key = `L_${source}_${target}`;
    const n = seen.get(key) ?? 0;

    seen.set(key, n + 1);

    return `${key}_${n}`;
  };
};

export interface Structure {
  nodeIds: string[];
  edges: number;
  subgraphNames: string[];
  maxDepth: number;

  // Set only by the tree-shaped types: see max_tree_depth.
  treeDepth?: number;

  // Set only by the types that draw rows inside a node: see rows.
  rows?: number;
}

export function architectureDepth(groups: Array<{ id?: string; in?: string }>, parents = groups): number {
  const parentOf = new Map<string, string | undefined>();

  for (const g of parents) {
    parentOf.set(g.id ?? "", g.in);
  }

  let max = 0;

  for (const g of groups) {
    let depth = 1;
    let cur = g.in;
    const seen = new Set<string>();

    while (cur && !seen.has(cur)) {
      seen.add(cur);
      depth++;
      cur = parentOf.get(cur);
    }

    if (depth > max) {
      max = depth;
    }
  }

  return max;
}

// Iterative preorder preserves parser child order without a recursive stack.
export function* walkTree<T extends { children?: readonly T[] }>(
  root: T | null | undefined,
): Generator<{ node: T; parent: T | null; depth: number }> {
  if (!root) {
    return;
  }

  const stack = [{ node: root, parent: null as T | null, depth: 0 }];

  while (stack.length) {
    const item = stack.pop();

    if (!item) {
      break;
    }

    yield item;

    const children = item.node.children ?? [];

    for (let index = children.length - 1; index >= 0; index--) {
      const child = children[index];

      if (child) {
        stack.push({ node: child, parent: item.node, depth: item.depth + 1 });
      }
    }
  }
}

// Canonical Mermaid DB adapters. No parser loading or source interpretation.

export type AnyDb = Record<string, unknown>;

export function callGetter<T>(db: AnyDb, name: string): T | null {
  const fn = db[name];

  return typeof fn === "function" ? ((fn as () => T)() ?? null) : null;
}
