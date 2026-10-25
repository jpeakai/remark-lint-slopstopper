// Text and range arithmetic that knows nothing about Markdown. A range is a
// half-open [start, end) span of absolute UTF-16 offsets into one source.
export type Range = [number, number];

// The ends of a list the caller has already proved non-empty.
export const first = <T>(items: readonly T[]): T => items[0] as T;
export const last = <T>(items: readonly T[]): T => items.at(-1) as T;

export const within = (range: Range, span: Range): boolean =>
  range[0] >= span[0] && range[1] <= span[1];

export const inRanges = (offset: number, ranges: readonly Range[]): boolean =>
  ranges.some(([start, end]) => offset >= start && offset < end);

// Soft line breaks collapse to single spaces; nothing else in the slice moves.
export const collapse = (text: string): string =>
  text.replace(/[ \t]*\r?\n[ \t]*/g, " ");

// The pattern must be global, so a non-global one fails loudly in matchAll.
export const countOf = (text: string, pattern: RegExp): number =>
  [...text.matchAll(pattern)].length;

export const wordsIn = (text: string): number =>
  text.split(/\s+/).filter(Boolean).length;

// The spans a run of cut points carves out: each runs from the end of its
// own cut to the start of the next one, and the last runs to `end`.
export const spansBetween = (cuts: readonly Range[], end: number): Range[] =>
  cuts.map((cut, i) => [cut[1], cuts[i + 1]?.[0] ?? end]);
