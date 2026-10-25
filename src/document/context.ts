import type { Nodes, Paragraph, Root, Text } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { Diagnostic, TextEdit } from "../types.ts";
import { conceptVocabulary } from "./concepts.ts";
import {
  type DeclaredEdit,
  type EditExpectation,
  verifyEdits,
} from "./edits.ts";
import { createLanguageView, type LanguageView } from "./language-view.ts";

declare module "mdast" {
  interface Data {
    language?: LanguageView;
  }
}

export interface Leaf {
  value: string;
  start: number;
}
export interface Projection {
  text: string;
  offsets: number[];
  endOffsets: number[];
  leaves: Leaf[];
}
export interface ParagraphContext {
  node: Paragraph;
  ancestors: readonly Nodes[];
}
export interface DocumentContext {
  readonly source: string;
  readonly tree: Root;
  readonly paragraphs: readonly ParagraphContext[];
  readonly textNodes: readonly Text[];
  readonly eol: string;
  projection(node: Paragraph | Text): Projection;
  language(node: Paragraph | Text): LanguageView;
  safeEdit(edit: TextEdit, expect?: EditExpectation): boolean;
  validateBatch(diagnostics: Diagnostic[]): void;
}

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ["yaml", "toml"]);
export const startOf = (node: Nodes): number =>
  node.position?.start.offset ?? 0;
export const endOf = (node: Nodes): number =>
  node.position?.end.offset ?? startOf(node);

function decodedToken(token: string, expected: string): string {
  if (token === "\r\n") return expected.includes("\r\n") ? "\r\n" : "\n";
  const first = parser.parse(token).children[0] as Nodes | undefined;
  if (!(first && "children" in first)) return token;
  const child = first.children[0];
  return child?.type === "text" ? child.value : token;
}
function mappedLines(
  value: string,
  expected: string,
  offsets: number[],
): number[] | null {
  const rawLines = value.split("\n");
  const textLines = expected.split("\n");
  if (rawLines.length !== textLines.length) return null;
  const mapped: number[] = [];
  let base = 0;
  for (const [line, rawLine] of rawLines.entries()) {
    const textLine = textLines[line] ?? "";
    const omitted = rawLine.length - textLine.length;
    if (
      !(
        rawLine.endsWith(textLine) &&
        /^[\t >]*$/.test(rawLine.slice(0, omitted))
      )
    )
      return null;
    mapped.push(...offsets.slice(base + omitted, base + rawLine.length));
    base += rawLine.length;
    if (line < rawLines.length - 1) mapped.push(offsets[base++] ?? 0);
  }
  return mapped;
}
// Decode escapes/entities with the Markdown parser, retaining original offsets.
function textOffsets(
  raw: string,
  expected: string,
  start: number,
): number[] | null {
  if (raw === expected)
    return Array.from({ length: raw.length }, (_, i) => start + i);
  let value = "";
  const offsets: number[] = [];
  let cursor = 0;
  const append = (text: string, at: number, exact: boolean): void => {
    for (let i = 0; i < text.length; i++)
      offsets.push(start + at + (exact ? i : 0));
    value += text;
  };
  for (const match of raw.matchAll(
    /\\([!-/:-@[-`{-~])|&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);|\r\n/gi,
  )) {
    append(raw.slice(cursor, match.index), cursor, true);
    const token = match[0];
    const decoded = decodedToken(token, expected);
    append(decoded, match.index, decoded === token);
    cursor = match.index + token.length;
  }
  append(raw.slice(cursor), cursor, true);
  return value === expected ? offsets : mappedLines(value, expected, offsets);
}
function mappedEnd(mapped: number[], index: number, fallback: number): number {
  const start = mapped[index] ?? fallback;
  const next = mapped[index + 1] ?? fallback;
  if (next > start) return next;
  return mapped.slice(index + 1).find((offset) => offset > start) ?? fallback;
}

function appendProjection(
  view: Projection,
  value: string,
  start: number,
  {
    mapped,
    end = start + value.length,
  }: { mapped?: number[] | null; end?: number } = {},
): void {
  for (const [i, glyph] of value.split("").entries()) {
    const ch = /\s/.test(glyph) ? " " : glyph;
    if (ch === " " && view.text.endsWith(" ")) continue;
    view.text += ch;
    view.offsets.push(mapped?.[i] ?? start);
    view.endOffsets.push(mapped ? mappedEnd(mapped, i, end) : end);
  }
}
function projectLeaf(node: Nodes, source: string, view: Projection): boolean {
  const start = startOf(node);
  if (node.type === "text") {
    const raw = source.slice(start, endOf(node));
    const mapped = textOffsets(raw, node.value ?? "", start);
    appendProjection(view, node.value ?? "", start, {
      mapped,
      end: endOf(node),
    });
    if (mapped) view.leaves.push({ value: raw, start });
    return true;
  }
  if (node.type === "inlineCode") {
    appendProjection(view, "CODE", start, { end: endOf(node) });
    return true;
  }
  if (node.type === "break") {
    appendProjection(view, " ", start, { end: endOf(node) });
    return true;
  }
  if (node.type === "image" || node.type === "imageReference") {
    appendProjection(view, node.alt ?? "", start, { end: endOf(node) });
    return true;
  }
  return node.type === "html";
}
function projection(node: Nodes, source: string): Projection {
  const view: Projection = {
    text: "",
    offsets: [],
    endOffsets: [],
    leaves: [],
  };
  const walk = (current: Nodes): void => {
    if (projectLeaf(current, source, view)) return;
    if ("children" in current)
      for (const child of current.children) walk(child);
  };
  walk(node);
  return view;
}

const hasHardBreak = (node: Nodes): boolean =>
  node.type === "break" ||
  ("children" in node && node.children.some(hasHardBreak));

export const unsafeLayout = ({ node, ancestors }: ParagraphContext): boolean =>
  ancestors.some((ancestor) => ancestor.type === "blockquote") ||
  hasHardBreak(node);

export const runningProse = ({ ancestors }: ParagraphContext): boolean =>
  !ancestors.some(
    (ancestor) => ancestor.type === "table" || ancestor.type === "tableCell",
  );

function attachViews(document: DocumentContext): void {
  const nodes = [
    ...document.paragraphs.map(({ node }) => node),
    ...document.textNodes,
  ];
  for (const node of nodes) {
    node.data ??= {};
    node.data.language = document.language(node);
  }
}

function nodeIndex(tree: Root): {
  paragraphs: ParagraphContext[];
  textNodes: Text[];
} {
  const paragraphs: ParagraphContext[] = [];
  const textNodes: Text[] = [];
  const walk = (node: Nodes, ancestors: Nodes[]): void => {
    if (node.type === "paragraph") paragraphs.push({ node, ancestors });
    if (node.type === "text") textNodes.push(node);
    if ("children" in node)
      for (const child of node.children) walk(child, [...ancestors, node]);
  };
  walk(tree, []);
  return { paragraphs, textNodes };
}

const SAME_TREE: EditExpectation = { kind: "same-tree" };

// Fixable diagnostics per rule: one rule's edits never overlap, so each
// group can be applied and reparsed as one batch.
const fixGroups = (diagnostics: readonly Diagnostic[]): Diagnostic[][] => {
  const groups = new Map<string, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.fix) continue;
    const group = groups.get(diagnostic.ruleId) ?? [];
    group.push(diagnostic);
    groups.set(diagnostic.ruleId, group);
  }
  return [...groups.values()];
};

export function createDocument(
  source: string,
  options: { tree?: Root; cwd?: string } = {},
): DocumentContext {
  const tree = options.tree ?? parser.parse(source);
  const vocabulary = conceptVocabulary(options.cwd ?? process.cwd());
  const projections = new WeakMap<Paragraph | Text, Projection>();
  const languages = new WeakMap<Paragraph | Text, LanguageView>();
  let original: Root | undefined;
  const declared = new WeakMap<TextEdit, EditExpectation>();
  const verify = (edits: readonly DeclaredEdit[]): boolean => {
    original ??= parser.parse(source);
    return verifyEdits({
      parse: (text) => parser.parse(text),
      source,
      before: original,
      edits,
    });
  };
  const document: DocumentContext = {
    source,
    tree,
    ...nodeIndex(tree),
    eol: source.match(/\r\n|\r|\n/)?.[0] ?? "\n",
    projection(node) {
      let view = projections.get(node);
      if (!view) {
        view = projection(node, source);
        projections.set(node, view);
      }
      return view;
    },
    language(node) {
      let view = languages.get(node);
      if (!view) {
        view = createLanguageView(
          () => document.projection(node).text,
          undefined,
          vocabulary,
        );
        languages.set(node, view);
      }
      return view;
    },
    safeEdit(edit, expect = SAME_TREE) {
      const accepted = verify([{ edit, expect }]);
      if (accepted) declared.set(edit, expect);
      return accepted;
    },
    validateBatch(diagnostics) {
      for (const group of fixGroups(diagnostics)) {
        const edits = group.flatMap(({ fix }) =>
          fix ? [{ edit: fix, expect: declared.get(fix) ?? SAME_TREE }] : [],
        );
        // Each edit was verified alone; when the batch is not, the first
        // still lands and the next round reports the rest again.
        if (edits.length < 2 || verify(edits)) continue;
        for (const diagnostic of group.slice(1)) delete diagnostic.fix;
      }
    },
  };
  attachViews(document);
  return document;
}
