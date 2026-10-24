import type { TextEdit } from "../types.ts";

export function applyEdits(source: string, edits: TextEdit[]) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let boundary = source.length;
  let result = source;
  for (const edit of sorted) {
    if (edit.end > boundary) throw new Error("Overlapping sentence fixes");
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    boundary = edit.start;
  }
  return result;
}
