import type { Code, Nodes } from "mdast";
import type { DocumentContext } from "../document/context.ts";

export interface Fence {
  value: string;
  start: number;
  end: number;
}

function fence(code: Code): Fence {
  const start = code.position?.start.offset;
  const end = code.position?.end.offset;

  if (start === undefined || end === undefined) {
    throw new Error("Markdown parser omitted Mermaid fence positions");
  }

  return { value: code.value, start, end };
}

export function fences(document: DocumentContext): Fence[] {
  const found: Fence[] = [];

  function visit(node: Nodes): void {
    if (node.type === "code" && node.lang?.toLowerCase() === "mermaid") {
      found.push(fence(node));
    }

    if ("children" in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  }

  visit(document.tree);

  return found;
}

export function sourceLocation(source: string, node: Fence, line = 1): { start: number; end: number } {
  let start = node.start;
  const endings = /\r\n|\r|\n/g;

  endings.lastIndex = start;

  for (let n = 0; n < line; n++) {
    const next = endings.exec(source);

    if (!next || next.index >= node.end) {
      break;
    }

    start = next.index + next[0].length;
  }

  endings.lastIndex = start;

  const newline = endings.exec(source);

  return {
    start,
    end: Math.min(node.end, newline?.index ?? source.length),
  };
}
