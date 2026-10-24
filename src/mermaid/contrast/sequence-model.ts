import type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";
import type { Actor, Message } from "mermaid/dist/diagrams/sequence/types.js";
import {
  isSequenceMessage,
  type SequenceCodes,
  sequenceCodes,
} from "../parsing/adapters/sequence.ts";

// Ordered parser events determine which sequence labels actually exist.

const LINE = {
  NOTE: 2,
  RECT_START: 22,
  RECT_END: 23,
  AUTONUMBER: 26,
} as const;

const FRAME_STARTS = new Set([10, 12, 15, 19, 27, 30, 32]);

export interface SequenceBackdrop {
  fills: string[];
  rect: number | undefined;
}
interface SequenceLabels {
  signals: SequenceBackdrop[];
  notes: SequenceBackdrop[];
  frames: SequenceBackdrop[];
  numbers: SequenceBackdrop[];
}
export interface SequenceFeatures extends SequenceLabels {
  boxedActors: string[][];
  pageActors: string[][];
  paintedBoxes: boolean;
  namedBoxes: boolean;
  unsupportedActorTypes: string[];
}
function actorBackdrops(actors: Actor[], types: Set<string>): string[][] {
  const fills = actors
    .filter((actor) => types.has(actor.type))
    .map((actor) => actor.box?.fill ?? "transparent");
  return [...new Set(fills)].map((fill) => [fill]);
}
interface SequencePaintState {
  fills: string[];
  rects: number[];
  nextRect: number;
  numbered: boolean;
}
function paintEvent(record: Message, state: SequencePaintState): boolean {
  if (record.type === LINE.RECT_START) {
    state.fills.push(String(record.message));
    state.rects.push(state.nextRect++);
    return true;
  }
  if (record.type === LINE.RECT_END) {
    state.fills.pop();
    state.rects.pop();
    return true;
  }
  if (record.type !== LINE.AUTONUMBER) return false;
  state.numbered = typeof record.message !== "string" && record.message.visible;
  return true;
}
function recordLabels(
  record: Message,
  state: SequencePaintState,
  labels: SequenceLabels,
  codes: SequenceCodes,
): void {
  const backdrop = { fills: [...state.fills], rect: state.rects.at(-1) };
  if (isSequenceMessage(codes, record)) {
    if (typeof record.message === "string" && record.message.trim())
      labels.signals.push(backdrop);
    if (state.numbered) labels.numbers.push(backdrop);
  }
  if (record.type === LINE.NOTE) labels.notes.push(backdrop);
  if (record.type !== undefined && FRAME_STARTS.has(record.type))
    labels.frames.push(backdrop);
}
function sequenceLabels(db: SequenceDB): SequenceLabels {
  const labels: SequenceLabels = {
    signals: [],
    notes: [],
    frames: [],
    numbers: [],
  };
  const state: SequencePaintState = {
    fills: [],
    rects: [],
    nextRect: 0,
    numbered: false,
  };
  const codes = sequenceCodes(db as unknown as Record<string, unknown>);
  for (const record of db.getMessages()) {
    if (!paintEvent(record, state)) recordLabels(record, state, labels, codes);
  }
  return labels;
}
export const sequenceFeatures = (db: SequenceDB): SequenceFeatures => {
  const actors = [...db.getActors().values()].filter((actor) =>
    actor.description.trim(),
  );
  const boxed = new Set(["participant", "collections", "queue"]);
  const unboxed = new Set([
    "actor",
    "boundary",
    "control",
    "entity",
    "database",
  ]);
  return {
    boxedActors: actorBackdrops(actors, boxed),
    pageActors: actorBackdrops(actors, unboxed),
    paintedBoxes: db.getBoxes().some((box) => box.fill !== "transparent"),
    namedBoxes: db.getBoxes().some((box) => box.name?.trim()),
    unsupportedActorTypes: [
      ...new Set(
        actors
          .filter(
            (actor) => !(boxed.has(actor.type) || unboxed.has(actor.type)),
          )
          .map((actor) => actor.type),
      ),
    ],
    ...sequenceLabels(db),
  };
};
