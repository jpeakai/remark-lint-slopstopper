import type { AnyDb, Structure } from "../model.ts";

interface SequenceRecord {
  type?: number;
  from?: unknown;
  to?: unknown;
  message?: unknown;
}
interface SequenceState {
  records?: {
    actors?: Map<string, unknown>;
    messages?: Array<unknown>;
    boxes?: Array<{ name?: string }>;
  };
}
// The sequence db's messages list holds every statement in order: a message,
// but also a note, an activation and each line that opens, divides or closes a
// block. Each carries a code from the db's own LINETYPE table. A block opens
// with one code, may be divided (else, and, option), and closes with another.
// A par_over block closes with PAR_END, like par. A `rect` is left out: it
// tints the background behind its messages, with no title or border, so it is
// a highlight rather than a boundary to track.
const SEQUENCE_BLOCK_OPENERS = [
  "LOOP_START",
  "ALT_START",
  "OPT_START",
  "PAR_START",
  "CRITICAL_START",
  "BREAK_START",
  "PAR_OVER_START",
] as const;
const SEQUENCE_BLOCK_CLOSERS = [
  "LOOP_END",
  "ALT_END",
  "OPT_END",
  "PAR_END",
  "CRITICAL_END",
  "BREAK_END",
] as const;

export interface SequenceCodes {
  note: number;
  open: ReadonlySet<number>;
  close: ReadonlySet<number>;
}

// The codes read from a sequence db's LINETYPE table. A name the table lacks
// throws, because a statement could not then be told apart.
export const sequenceCodes = (db: AnyDb): SequenceCodes => {
  const table = db.LINETYPE as Readonly<Record<string, unknown>> | undefined;
  const code = (name: string): number => {
    const value = table?.[name];
    if (typeof value !== "number")
      throw new Error(`the sequence db's LINETYPE has no ${name}`);
    return value;
  };
  return {
    note: code("NOTE"),
    open: new Set(SEQUENCE_BLOCK_OPENERS.map(code)),
    close: new Set(SEQUENCE_BLOCK_CLOSERS.map(code)),
  };
};

// A message runs from one participant to another (or itself). A note also
// names both, so it is told apart by its code, and an activation names only one.
export const isSequenceMessage = (
  codes: SequenceCodes,
  m: SequenceRecord,
): boolean =>
  m.type !== codes.note &&
  typeof m.from === "string" &&
  typeof m.to === "string";

export function adaptSequence(db: AnyDb): Structure {
  const codes = sequenceCodes(db);
  // sequenceDb stores state under db.state.records.{actors,messages,boxes}.
  const state = (db.state as SequenceState | undefined)?.records;
  const actors =
    state?.actors instanceof Map ? state.actors : new Map<string, unknown>();
  const rawMessages = state?.messages;
  const records = (
    Array.isArray(rawMessages) ? rawMessages : []
  ) as SequenceRecord[];
  const boxes = Array.isArray(state?.boxes) ? state.boxes : [];
  // A box groups participants and a block frames messages: both are drawn as
  // a labelled boundary. Boxes cannot nest, and blocks nest inside each other.
  const subgraphNames = boxes.map((b, i) => b.name || `box_${i}`);
  const maxBlockDepth = sequenceBlockDepth(records, codes, subgraphNames);
  return {
    nodeIds: [...actors.keys()],
    edges: records.filter((r) => isSequenceMessage(codes, r)).length,
    subgraphNames,
    maxDepth: Math.max(boxes.length > 0 ? 1 : 0, maxBlockDepth),
  };
}

function sequenceBlockDepth(
  records: SequenceRecord[],
  codes: SequenceCodes,
  names: string[],
): number {
  let depth = 0;
  let maxBlockDepth = 0;
  for (const r of records) {
    if (r.type === undefined) continue;
    if (codes.open.has(r.type)) {
      depth++;
      maxBlockDepth = Math.max(maxBlockDepth, depth);
      names.push(sequenceBlockName(r, names.length));
    } else if (codes.close.has(r.type)) {
      depth = Math.max(0, depth - 1);
    }
  }
  return maxBlockDepth;
}

const sequenceBlockName = (record: SequenceRecord, index: number): string =>
  typeof record.message === "string" && record.message
    ? record.message
    : `block_${index}`;
