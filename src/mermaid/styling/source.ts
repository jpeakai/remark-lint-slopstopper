import type { Yaml } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { frontmatter } from "micromark-extension-frontmatter";
import { isMap, isScalar, LineCounter, parseDocument } from "yaml";

// Align Mermaid's preprocessed text and YAML keys with authored source.

// The diagram's YAML frontmatter as mdast reads it, or null when it has none.
// micromark finds the block, per SLOP-0023.
const frontmatterOf = (source: string): Yaml | null => {
  const tree = fromMarkdown(source, {
    extensions: [frontmatter(["yaml"])],
    mdastExtensions: [frontmatterFromMarkdown(["yaml"])],
  });
  const node = tree.children[0];
  return node?.type === "yaml" && node.position ? node : null;
};

// The 0-based index of the first source line past the frontmatter, where the
// diagram body starts. Mermaid drops the frontmatter before it parses, so no
// parsed line comes from above it.
const bodyStart = (source: string): number =>
  frontmatterOf(source)?.position?.end.line ?? 0;

// The length of the text two strings start with.
const commonPrefix = (a: string, b: string): number => {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return n;
};

// The anchors of sourceLines: each parsed line matched to the one body line it
// can come from. Mermaid drops lines but never adds or reorders them, so a
// parsed line comes from a source line of the same text at or after its
// earliest place, matching every line in order from the top, and at or before
// its latest, matching from the bottom. It anchors only when those are the
// same line. A blank line never anchors.
const anchorsOf = (
  src: string[],
  txt: string[],
  body: number,
): Array<number | undefined> => {
  const early = earlyAnchors(src, txt, body);
  const late: Array<number | undefined> = [];
  let cursor = src.length - 1;
  for (let i = txt.length - 1; i >= 0 && cursor >= body; i--) {
    const line = txt[i] ?? "";
    if (!line.trim()) continue;
    const j = src.lastIndexOf(line, cursor);
    if (j >= body) {
      late[i] = j;
      cursor = j - 1;
    }
  }
  return txt.map((_, i) =>
    early[i] !== undefined && early[i] === late[i] ? early[i] : undefined,
  );
};

const earlyAnchors = (
  src: string[],
  txt: string[],
  body: number,
): Array<number | undefined> => {
  const early: Array<number | undefined> = [];
  let cursor = body;
  for (const [i, line] of txt.entries()) {
    if (!line.trim()) continue;
    const j = src.indexOf(line, cursor);
    if (j >= 0) {
      early[i] = j;
      cursor = j + 1;
    }
  }
  return early;
};

// Places a line of the text mermaid parsed in the diagram source, as a
// 1-based source line, or null when it cannot be placed exactly. A line is
// anchored when exactly one body line can be it (anchorsOf). A line mermaid
// edited, or one two lines could be, lies between two anchored lines: it is
// placed by position when as many lines lie between them in the source, which
// means none were dropped, or else by the one source line there that shares
// at least the text up to the end of the statement's keyword with it. When two
// source lines share that much, it is not placed.
export const sourceLines = (
  source: string,
  parsed: string,
): ((line: number, keywordEnd?: number) => number | null) => {
  const src = source.split(/\r\n|\r|\n/).map((l) => l.trimStart());
  const raw = parsed.split(/\r\n|\r|\n/);
  const txt = raw.map((l) => l.trimStart());
  const body = bodyStart(source);
  const anchor = anchorsOf(src, txt, body);
  // The nearest anchored parsed line before i (step -1) or after it (step 1).
  const nearest = (i: number, step: number): number => {
    let k = i + step;
    while (k >= 0 && k < txt.length && anchor[k] === undefined) k += step;
    return k;
  };
  return (line, keywordEnd = 0) => {
    const i = line - 1;
    const hit = anchor[i];
    if (hit !== undefined) return hit + 1;
    const text = txt[i];
    if (text === undefined) return null;
    const a = nearest(i, -1);
    const b = nearest(i, 1);
    const from = anchor[a] ?? body - 1;
    const to = anchor[b];
    if (to !== undefined && to - from === b - a) return from + (i - a) + 1;
    const least = keywordEnd - ((raw[i]?.length ?? 0) - text.length);
    return betweenIfShared(src, [from, to ?? src.length], text, least);
  };
};

const betweenIfShared = (
  source: string[],
  bounds: [number, number],
  text: string,
  least: number,
): number | null =>
  least > 0 ? onlyBetween(source, bounds, text, least) : null;

// The one source line strictly between from and to that shares at least
// `least` characters of text with a parsed line, as a 1-based line, or null
// when no line or more than one does.
const onlyBetween = (
  src: string[],
  [from, to]: [number, number],
  text: string,
  least: number,
): number | null => {
  const found = src
    .slice(from + 1, to)
    .map((s, k) => ({ at: from + 1 + k, shared: commonPrefix(s, text) }))
    .filter((c) => c.shared >= least);
  return found.length === 1 && found[0] ? found[0].at + 1 : null;
};

// The source line of a key in the diagram's YAML frontmatter, by its path from
// the document root, or null when the frontmatter does not set it. The
// frontmatter is found by mdast and read by yaml, per SLOP-0023.
export const frontmatterLine = (
  source: string,
  path: string[],
): number | null => {
  const node = frontmatterOf(source);
  if (!node?.position) return null;
  const counter = new LineCounter();
  let current: unknown = parseDocument(node.value.replace(/\r\n|\r/g, "\n"), {
    lineCounter: counter,
  }).contents;
  let offset: number | undefined;
  for (const key of path) {
    if (!isMap(current)) return null;
    const pair = current.items.find(
      (p) => isScalar(p.key) && String(p.key.value) === key,
    );
    if (!(pair && isScalar(pair.key))) return null;
    offset = pair.key.range?.[0];
    current = pair.value;
  }
  return offset === undefined
    ? null
    : node.position.start.line + counter.linePos(offset).line;
};
