export function pointAt(source: string, offset: number) {
  const before = source.slice(0, offset);
  const lines = before.split(/\r\n|\r|\n/);

  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
    offset,
  };
}
