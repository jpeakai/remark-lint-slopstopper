import type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";
import type { Actor, Message } from "mermaid/dist/diagrams/sequence/types.js";
import { isSequenceMessage, type SequenceCodes, sequenceCodes } from "../parsing/adapters/sequence.ts";

// Ordered parser events determine which sequence labels exist and which
// painted columns lie beneath them. Mermaid 11.17.2 lays participants out in
// declaration order and paints each group as one rectangle from its first to
// its last member, so a label's possible backdrops follow from the
// participants it spans.

const LINE = {
  NOTE: 2,
  RECT_START: 22,
  RECT_END: 23,
  AUTONUMBER: 26,
} as const;

const PLACEMENT = { LEFTOF: 0, RIGHTOF: 1, OVER: 2 } as const;

const FRAME_STARTS = new Set([10, 12, 15, 19, 27, 30, 32]);
const FRAME_ENDS = new Set([11, 14, 16, 21, 29, 31]);

// A painted participant group, or the page when `group` is undefined.
export interface SequenceRegion {
  fill: string;
  group: number | undefined;
}

export interface SequenceBackdrop {
  // Every region the label can overlap; each yields its own measurement.
  regions: SequenceRegion[];

  // Rect fills above the regions, outermost first, in statement order.
  fills: string[];
  rect: number | undefined;
}

export interface SequenceGroup {
  name: string;
  fill: string;
}

interface SequenceLabels {
  signals: SequenceBackdrop[];
  notes: SequenceBackdrop[];
  frameLabels: SequenceBackdrop[];
  frameTexts: SequenceBackdrop[];
  numbers: SequenceBackdrop[];
  messageLines: SequenceBackdrop[];
}

export interface SequenceFeatures extends SequenceLabels {
  boxedActors: string[][];
  pageActors: string[][];
  groups: SequenceGroup[];
  lifelines: SequenceBackdrop[];
  unsupportedActorTypes: string[];

  // Precise reasons a painted extent cannot be measured.
  unmeasurable: { selector: string; reason: string }[];
}

const PAGE: SequenceRegion = { fill: "transparent", group: undefined };

interface Layout {
  order: string[];
  groupAt: (number | undefined)[];
  groups: SequenceGroup[];
}

function actorBackdrops(actors: Actor[], types: Set<string>): string[][] {
  const fills = actors.filter((actor) => types.has(actor.type)).map((actor) => actor.box?.fill ?? "transparent");

  return [...new Set(fills)].map((fill) => [fill]);
}

// Only a painted group differs from the page; a transparent one shows the page.
function regionAt(layout: Layout, index: number): SequenceRegion {
  const group = layout.groupAt[index];
  const painted = group === undefined ? undefined : layout.groups[group];

  return painted && painted.fill !== "transparent" ? { fill: painted.fill, group } : PAGE;
}

function distinct(regions: SequenceRegion[]): SequenceRegion[] {
  const seen = new Map<string, SequenceRegion>();

  for (const region of regions) {
    seen.set(String(region.group), region);
  }

  return [...seen.values()];
}

// Participants lo..hi; crossing between regions also crosses a page gap.
function span(layout: Layout, lo: number, hi: number): SequenceRegion[] {
  const regions = distinct(Array.from({ length: hi - lo + 1 }, (_, offset) => regionAt(layout, lo + offset)));

  return regions.length > 1 ? distinct([...regions, PAGE]) : regions;
}

// A label centred on an edge participant can extend past its group's edge.
function beyond(layout: Layout, index: number, step: -1 | 1): SequenceRegion[] {
  const own = regionAt(layout, index);
  const next = index + step;

  if (next < 0 || next >= layout.order.length) {
    return [PAGE];
  }

  const neighbour = regionAt(layout, next);

  if (own.group === undefined) {
    return [neighbour];
  }

  return neighbour.group === own.group ? [] : [PAGE];
}

interface PaintState {
  fills: string[];
  rects: number[];
  nextRect: number;
  numbered: boolean;
  frames: { label: SequenceBackdrop; text: SequenceBackdrop; actors: Set<number> }[];
  openRects: { fills: string[]; rect: number; actors: Set<number> }[];
  closedRects: { fills: string[]; rect: number; lo: number; hi: number }[];
}

function closeRect(state: PaintState): void {
  const open = state.openRects.pop();

  if (open?.actors.size) {
    state.closedRects.push({
      fills: open.fills,
      rect: open.rect,
      lo: Math.min(...open.actors),
      hi: Math.max(...open.actors),
    });
  }
}

function paintEvent(record: Message, state: PaintState): boolean {
  if (record.type === LINE.RECT_START) {
    state.fills.push(String(record.message));
    state.rects.push(state.nextRect);
    state.openRects.push({ fills: [...state.fills], rect: state.nextRect++, actors: new Set() });

    return true;
  }

  if (record.type === LINE.RECT_END) {
    state.fills.pop();
    state.rects.pop();
    closeRect(state);

    return true;
  }

  if (record.type !== LINE.AUTONUMBER) {
    return false;
  }

  state.numbered = typeof record.message !== "string" && record.message.visible;

  return true;
}

class LabelReader {
  readonly labels: SequenceLabels = {
    signals: [],
    notes: [],
    frameLabels: [],
    frameTexts: [],
    numbers: [],
    messageLines: [],
  };

  readonly unmeasurable: { selector: string; reason: string }[] = [];

  readonly state: PaintState = {
    fills: [],
    rects: [],
    nextRect: 0,
    numbered: false,
    frames: [],
    openRects: [],
    closedRects: [],
  };

  private readonly codes: SequenceCodes;

  private readonly index: Map<string, number>;

  private readonly layout: Layout;

  constructor(db: SequenceDB, layout: Layout) {
    this.layout = layout;
    this.codes = sequenceCodes(db as unknown as Record<string, unknown>);
    this.index = new Map(layout.order.map((name, position) => [name, position]));
  }

  read(record: Message): void {
    if (paintEvent(record, this.state)) {
      return;
    }

    if (FRAME_STARTS.has(record.type ?? -1)) {
      this.openFrame();
    } else if (FRAME_ENDS.has(record.type ?? -1)) {
      this.closeFrame();
    } else if (isSequenceMessage(this.codes, record)) {
      this.message(record);
    } else if (record.type === LINE.NOTE) {
      this.note(record);
    }
  }

  finish(): void {
    while (this.state.frames.length) {
      this.closeFrame();
    }

    while (this.state.openRects.length) {
      closeRect(this.state);
    }
  }

  private backdrop(regions: SequenceRegion[]): SequenceBackdrop {
    return { regions, fills: [...this.state.fills], rect: this.state.rects.at(-1) };
  }

  private positions(...names: (string | undefined)[]): number[] {
    const found = names.map((name) => (name === undefined ? undefined : this.index.get(name)));

    return found.filter((position) => position !== undefined);
  }

  private touch(positions: number[]): void {
    for (const holder of [...this.state.frames, ...this.state.openRects]) {
      for (const position of positions) {
        holder.actors.add(position);
      }
    }
  }

  private message(record: Message): void {
    const positions = this.positions(record.from, record.to);
    const [from = 0] = positions;
    const lo = Math.min(...positions, from);
    const hi = Math.max(...positions, from);
    const regions =
      lo === hi
        ? distinct([regionAt(this.layout, lo), ...beyond(this.layout, lo, -1), ...beyond(this.layout, lo, 1)])
        : span(this.layout, lo, hi);

    this.touch(positions);
    this.labels.messageLines.push(this.backdrop(regions));

    if (typeof record.message === "string" && record.message.trim()) {
      this.labels.signals.push(this.backdrop(regions));
    }

    if (this.state.numbered) {
      this.labels.numbers.push(this.backdrop([regionAt(this.layout, from)]));
    }
  }

  private note(record: Message): void {
    const positions = this.positions(record.from, record.to);

    if (!positions.length) {
      this.labels.notes.push(this.backdrop([PAGE]));

      return;
    }

    const lo = Math.min(...positions);
    const hi = Math.max(...positions);
    const sides: SequenceRegion[] = [];

    // A note over two participants stays between their lifelines; one over a
    // single participant is centred on it, like a self message label.
    if (lo !== hi) {
      this.touch(positions);
      this.labels.notes.push(this.backdrop(span(this.layout, lo, hi)));

      return;
    }

    const placement = record.placement as unknown as number | undefined;

    if (placement !== PLACEMENT.RIGHTOF) {
      sides.push(...beyond(this.layout, lo, -1));
    }

    if (placement !== PLACEMENT.LEFTOF) {
      sides.push(...beyond(this.layout, hi, 1));
    }

    this.touch(positions);
    this.labels.notes.push(this.backdrop(distinct([...span(this.layout, lo, hi), ...sides])));
  }

  // Slots are reserved at the start, so labels keep statement order; their
  // regions are known once the frame's participants are.
  private openFrame(): void {
    const label = this.backdrop([]);
    const text = this.backdrop([]);

    this.labels.frameLabels.push(label);
    this.labels.frameTexts.push(text);
    this.state.frames.push({ label, text, actors: new Set() });
  }

  private closeFrame(): void {
    const frame = this.state.frames.pop();

    if (!frame) {
      return;
    }

    if (!frame.actors.size) {
      const painted = this.layout.groups.some((group) => group.fill !== "transparent");

      frame.label.regions = [PAGE];
      frame.text.regions = [PAGE];

      if (painted) {
        this.unmeasurable.push({ selector: "frame", reason: "a frame without messages has no measurable position" });
      }

      return;
    }

    const lo = Math.min(...frame.actors);
    const hi = Math.max(...frame.actors);

    frame.label.regions = [regionAt(this.layout, lo)];
    frame.text.regions = span(this.layout, lo, hi);
  }
}

function layoutOf(db: SequenceDB): { layout: Layout; unmeasurable: { selector: string; reason: string }[] } {
  const boxes = db.getBoxes();
  const order = [...db.getActors().keys()];
  const groupAt = order.map((name) => {
    const box = db.getActors().get(name)?.box;

    return box ? boxes.indexOf(box) : undefined;
  });
  const unmeasurable = boxes.flatMap((box, group) => {
    const members = groupAt.flatMap((at, position) => (at === group ? [position] : []));
    const adjacent = members.every((position, offset) => offset === 0 || position === (members[offset - 1] ?? 0) + 1);

    return adjacent
      ? []
      : [
          {
            selector: "box",
            reason: `participant group ${box.name || group + 1} has members declared apart, so its painted extent cannot be measured`,
          },
        ];
  });

  return {
    layout: {
      order,
      groupAt: groupAt.map((at) => (at === -1 ? undefined : at)),
      groups: boxes.map((box) => ({ name: box.name ?? "", fill: box.fill })),
    },
    unmeasurable,
  };
}

function lifelines(layout: Layout, rects: PaintState["closedRects"]): SequenceBackdrop[] {
  return layout.order.flatMap((_, position) => {
    const regions = [regionAt(layout, position)];
    const covering = rects.filter((rect) => rect.lo <= position && position <= rect.hi);

    return [
      { regions, fills: [], rect: undefined },
      ...covering.map((rect) => ({ regions, fills: rect.fills, rect: rect.rect })),
    ];
  });
}

export const sequenceFeatures = (db: SequenceDB): SequenceFeatures => {
  const actors = [...db.getActors().values()].filter((actor) => actor.description.trim());
  const boxed = new Set(["participant", "collections", "queue"]);
  const unboxed = new Set(["actor", "boundary", "control", "entity", "database"]);
  const { layout, unmeasurable } = layoutOf(db);
  const reader = new LabelReader(db, layout);

  for (const record of db.getMessages()) {
    reader.read(record);
  }

  reader.finish();

  return {
    boxedActors: actorBackdrops(actors, boxed),
    pageActors: actorBackdrops(actors, unboxed),
    groups: layout.groups,
    lifelines: lifelines(layout, reader.state.closedRects),
    unsupportedActorTypes: [
      ...new Set(
        actors.filter((actor) => !(boxed.has(actor.type) || unboxed.has(actor.type))).map((actor) => actor.type),
      ),
    ],
    unmeasurable: [...unmeasurable, ...reader.unmeasurable],
    ...reader.labels,
  };
};
