import type { IshikawaDB } from "mermaid/dist/diagrams/ishikawa/ishikawaDb.js";
import type { MindmapDB } from "mermaid/dist/diagrams/mindmap/mindmapDb.js";
import type {
  RailroadDB,
  ASTNode as RailroadNode,
} from "mermaid/dist/diagrams/railroad/railroadTypes.js";
import { type AnyDb, callGetter, type Structure, walkTree } from "../model.ts";

interface BlockItem {
  id?: string;
  type?: string;
  children?: BlockItem[];
}
export function adaptBlock(db: AnyDb): Structure {
  // Block uses a recursive tree: container blocks have non-empty `children`,
  // leaf blocks don't. Walk each top-level block in parser order.
  const roots = callGetter<BlockItem[]>(db, "getBlocks") ?? [];
  const edges = (callGetter<Array<unknown>>(db, "getEdges") ?? []).length;
  const leaves: string[] = [];
  const containers: string[] = [];
  let maxDepth = 0;
  const nodes = roots.flatMap((root) => [...walkTree(root)]);
  for (const { node: item, depth } of nodes) {
    const id = item.id ?? "";
    const kids = item.children ?? [];
    // Mermaid wraps content in "space" / "composite" synthetic nodes;
    // count user-visible blocks only. Treat composite-with-children as
    // a container (subgraph), everything else as a leaf node.
    if (kids.length > 0) {
      containers.push(id);
      maxDepth = Math.max(maxDepth, depth + 1);
    } else if (visibleBlock(item)) {
      leaves.push(id);
    }
  }
  return { nodeIds: leaves, edges, subgraphNames: containers, maxDepth };
}

const visibleBlock = (item: BlockItem): boolean =>
  item.type !== "space" && item.type !== "composite";

export function adaptIshikawa(db: AnyDb): Structure {
  const root = (db as unknown as IshikawaDB).getRoot();
  const nodes = [...walkTree(root)];
  return {
    nodeIds: nodes.map(({ node }) => node.text),
    edges: Math.max(0, nodes.length - 1),
    subgraphNames: [],
    maxDepth: 0,
    treeDepth: nodes.reduce((depth, item) => Math.max(depth, item.depth), 0),
  };
}

export function adaptMindmap(db: AnyDb): Structure {
  const root = (db as unknown as MindmapDB).getMindmap();
  const nodes = [...walkTree(root)];
  return {
    nodeIds: nodes.map(({ node }) => node.descr),
    edges: Math.max(0, nodes.length - 1),
    subgraphNames: [],
    maxDepth: 0,
    treeDepth: nodes.reduce((depth, item) => Math.max(depth, item.depth), 0),
  };
}

// Railroad grammars all normalize to Mermaid's public RailroadDB IR. Count
// visible symbol boxes and the connector paths their renderer constructs.
// Rule-entry/exit markers and their connectors are excluded, as for state
// markers. Constructors have no container border, so nesting is tree depth.
export function adaptRailroad(rawDb: AnyDb): Structure {
  const db = rawDb as unknown as RailroadDB;
  const nodeIds: string[] = [];
  let edges = 0;
  let treeDepth = 0;
  const walk = (node: RailroadNode, path: string, depth: number): void => {
    switch (node.type) {
      case "terminal":
      case "nonterminal":
      case "special":
        nodeIds.push(path);
        treeDepth = Math.max(treeDepth, depth);
        return;
      case "sequence":
        edges += Math.max(0, node.elements.length - 1);
        node.elements.forEach((child, i) => {
          walk(child, `${path}/${i}`, depth);
        });
        return;
      case "choice":
        edges += 2 * node.alternatives.length;
        node.alternatives.forEach((child, i) => {
          walk(child, `${path}/${i}`, depth + 1);
        });
        return;
      case "optional":
        edges += 3;
        walk(node.element, `${path}/optional`, depth + 1);
        return;
      case "repetition":
        edges += node.min === 0 ? 4 : 3;
        walk(node.element, `${path}/repeat`, depth + 1);
    }
  };
  db.getRules().forEach((rule, i) => {
    walk(rule.definition, `${rule.name}/${i}`, 0);
  });
  return { nodeIds, edges, subgraphNames: [], maxDepth: 0, treeDepth };
}
