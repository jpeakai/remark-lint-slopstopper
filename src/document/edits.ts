import type { Nodes, Paragraph, Parent, Root } from "mdast";
import type { TextEdit } from "../types.ts";

export function applyEdits(source: string, edits: TextEdit[]) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let boundary = source.length;
  let result = source;

  for (const edit of sorted) {
    if (edit.end > boundary) {
      throw new Error("Overlapping sentence fixes");
    }

    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    boundary = edit.start;
  }

  return result;
}

// The exact change an edit declares. A layout edit moves whitespace only, so
// the tree stays the same once text whitespace collapses. A glyph swap keeps
// the tree's shape and every visible word. A promotion replaces one paragraph
// with the blocks parsed from `fragment`: optional paragraphs around exactly
// one list of `listItems` items, and nothing else in the document moves.
export type EditExpectation =
  | { kind: "same-tree" }
  | { kind: "same-shape" }
  | {
      kind: "replace-paragraph";
      paragraph: Paragraph;
      fragment: string;
      listItems: number;
    };

export interface DeclaredEdit {
  edit: TextEdit;
  expect: EditExpectation;
}

export class LostWordError extends Error {
  constructor(detail: string) {
    super(`An automatic edit lost content (${detail}); this is a fixer defect, not a document problem.`);
    this.name = "LostWordError";
  }
}

// Words a fixer may never lose or move: text, code, alt text and every URL.
// Joining conjunctions and enumeration markers are punctuation a promotion
// is allowed to rewrite, so they are left out of the comparison.
const ENUM_MARKER = /(?<![\p{L}\p{N}_])\((?:[a-z]|[ivx]+|\d+)\)/giu;
const CARRIERS = new Set(["inlineCode", "code", "html", "yaml", "toml"]);

const wordsOf = (text: string | null | undefined): string[] =>
  [...(text ?? "").matchAll(/[\p{L}\p{N}_]+/gu)].map((match) => match[0]).filter((word) => !/^(?:and|or)$/i.test(word));

export const visibleWords = (node: Nodes): string[] => {
  const n = node as Nodes & {
    value?: string;
    url?: string;
    alt?: string;
    title?: string;
  };
  const own =
    node.type === "text"
      ? wordsOf(n.value?.replace(ENUM_MARKER, " "))
      : CARRIERS.has(node.type)
        ? wordsOf(n.value)
        : [];
  const children = "children" in node ? node.children.flatMap(visibleWords) : [];

  return [...own, ...wordsOf(n.url), ...wordsOf(n.alt), ...wordsOf(n.title), ...children];
};

interface Normalisation {
  blankText: boolean;
  trim: boolean;
  swaps: ReadonlyMap<Nodes, readonly Nodes[]>;
}

const textValue = (value: string, options: Normalisation): string => {
  if (options.blankText) {
    return "";
  }

  const collapsed = value.replace(/\s+/g, " ");

  return options.trim ? collapsed.trim() : collapsed;
};

// A position-free copy of a tree for structural comparison. `swaps` replaces
// a node with a list of nodes, which builds the tree a promotion expects.
const normaliseValue = (node: Nodes, key: string, value: unknown, options: Normalisation): unknown => {
  if (key === "children" && "children" in node) {
    return node.children.flatMap((child: Nodes) =>
      (options.swaps.get(child) ?? [child]).map((c) => normalise(c, options)),
    );
  }

  return key === "value" && node.type === "text" ? textValue(node.value, options) : value;
};

const normalise = (node: Nodes, options: Normalisation): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key !== "position" && key !== "data")
      .map(([key, value]) => [key, normaliseValue(node, key, value, options)]),
  );

const descendants = (node: Nodes): Nodes[] => [node, ...("children" in node ? node.children.flatMap(descendants) : [])];

const rangeOf = (node: Nodes): string => `${node.position?.start.offset}:${node.position?.end.offset}`;

// Definitions resolve references document-wide, so a fragment parsed on its
// own borrows every definition from the document it came from.
const definitionsOf = (source: string, tree: Root): string[] =>
  descendants(tree).flatMap((node) =>
    node.type === "definition" || node.type === "footnoteDefinition"
      ? [source.slice(node.position?.start.offset, node.position?.end.offset)]
      : [],
  );

const fragmentShapeOk = (nodes: readonly Nodes[], items: number): boolean => {
  const lists = nodes.filter((node) => node.type === "list") as Parent[];

  if (lists.length !== 1) {
    return false;
  }

  if (nodes.some((node) => node.type !== "list" && node.type !== "paragraph")) {
    return false;
  }

  const children = (lists[0] as Parent).children as Parent[];

  return children.length === items && children.every((item) => item.children[0]?.type === "paragraph");
};

export interface VerificationInput {
  parse: (source: string) => Root;
  source: string;
  before: Root;
  edits: readonly DeclaredEdit[];
}

// The blocks each promoted paragraph must become, or null when a fragment
// does not parse to the declared shape or its paragraph cannot be found.
const promotionSwaps = (input: VerificationInput): Map<Nodes, Nodes[]> | null => {
  const swaps = new Map<Nodes, Nodes[]>();
  const definitions = definitionsOf(input.source, input.before);
  const byRange = new Map(
    descendants(input.before).flatMap((node) => (node.type === "paragraph" ? [[rangeOf(node), node] as const] : [])),
  );

  for (const { expect } of input.edits) {
    if (expect.kind !== "replace-paragraph") {
      continue;
    }

    const target = byRange.get(rangeOf(expect.paragraph));
    const tree = input.parse([expect.fragment, ...definitions].join("\n\n"));
    const nodes = tree.children.slice(0, tree.children.length - definitions.length);

    if (!(target && fragmentShapeOk(nodes, expect.listItems))) {
      return null;
    }

    swaps.set(target, nodes);
  }

  return swaps;
};

const sameWords = (before: Root, after: Root): void => {
  const was = visibleWords(before);
  const now = visibleWords(after);
  const at = was.findIndex((word, i) => word !== now[i]);

  if (at === -1 && was.length === now.length) {
    return;
  }

  const index = at === -1 ? was.length : at;

  throw new LostWordError(`word ${index} was "${was[index] ?? ""}", now "${now[index] ?? ""}"`);
};

// Reparse the edited source and compare it with the original. Every edit
// must make exactly the change it declares; any other difference refuses the
// batch. A glyph swap or promotion that loses a word is a fixer defect, so it
// throws instead of being refused.
export const verifyEdits = (input: VerificationInput): boolean => {
  const after = input.parse(
    applyEdits(
      input.source,
      input.edits.map(({ edit }) => edit),
    ),
  );
  const kinds = new Set(input.edits.map(({ expect }) => expect.kind));

  if (kinds.has("same-shape") || kinds.has("replace-paragraph")) {
    sameWords(input.before, after);
  }

  const swaps = promotionSwaps(input);

  if (swaps === null) {
    return false;
  }

  const blankText = kinds.has("same-shape");
  const trim = kinds.has("replace-paragraph");
  const expected = normalise(input.before, { blankText, trim, swaps });
  const actual = normalise(after, { blankText, trim, swaps: new Map() });

  return JSON.stringify(expected) === JSON.stringify(actual);
};
