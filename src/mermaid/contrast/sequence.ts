import type { MermaidConfig } from "mermaid";
import type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";
import { getMermaidCore, type MermaidCore } from "../parsing/engine.ts";
import { parseTraced } from "../styling/declarations.ts";
import { frontmatterLine } from "../styling/source.ts";
import { compositeOver } from "./colors.ts";
import {
  type SequenceBackdrop,
  type SequenceFeatures,
  type SequenceRegion,
  sequenceFeatures,
} from "./sequence-model.ts";
import { type Canvas, GITHUB_CANVAS, resolveThemes, SUPPORTED_THEMES, THEMES, type Theme } from "./theme.ts";

// Sequence surfaces resolved through Mermaid's parser and theme engine.
// Text and connector surfaces are returned; policies own every WCAG decision.

interface SequenceSurface {
  // A connector is a lifeline or message line stroke, not text.
  kind: "text" | "connector";
  selector: string;
  foreground: string;
  background: string;
  line: number;
  theme: Theme;
}
interface ContrastResult {
  pairs: SequenceSurface[];
  skipped: SkippedDirective[];
}
export interface SkippedDirective {
  selector: string;
  line: number;
  reason: string;

  // Unsupported surfaces, styles, or colours prevent a complete contrast audit.
  blocking?: boolean;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

type Variables = Record<string, unknown>;

interface ParsedSequence {
  config: MermaidConfig;
  db: SequenceDB;
  lineOf: (key: string) => number;
  rectLines: number[];
  boxLines: number[];
}

const parseSequence = async (mermaid: MermaidCore, source: string): Promise<ParsedSequence | null> => {
  let config: MermaidConfig;

  try {
    ({ config } = await mermaid.parse(source));
  } catch {
    return null;
  }

  const parsed = await parseTraced(source);

  if (!parsed) {
    return null;
  }

  const { tokens, sourceLine, db } = parsed;
  const keywordLine = (tokens[0] && sourceLine(tokens[0].line)) ?? 1;
  const lines = new Map<string, number>();
  const lineOf = (key: string): number => {
    let line = lines.get(key);

    if (line === undefined) {
      line =
        frontmatterLine(source, ["config", "themeVariables", key]) ??
        frontmatterLine(source, ["config", key]) ??
        keywordLine;
      lines.set(key, line);
    }

    return line;
  };

  const linesOf = (name: string): number[] =>
    tokens.filter((t) => t.name === name).map((t) => sourceLine(t.line, t.endColumn) ?? keywordLine);

  return { config, db: db as unknown as SequenceDB, lineOf, rectLines: linesOf("rect"), boxLines: linesOf("box") };
};

const unmodelled = (config: MermaidConfig): { selector: string; reason: string } | null => {
  if (config.themeCSS !== undefined) {
    return {
      selector: "themeCSS",
      reason: "themeCSS restyles the diagram with CSS the audit cannot model",
    };
  }

  const pinned = config.theme;

  if (pinned !== undefined && !SUPPORTED_THEMES.includes(pinned)) {
    return {
      selector: "theme",
      reason: `the ${String(pinned)} theme is not modelled, only ${SUPPORTED_THEMES.join(", ")}`,
    };
  }

  return null;
};

interface SequenceTheme {
  theme: Theme;
  page: string;
  vars: Variables;
  lineOf: (key: string) => number;
  out: ContrastResult;
}

type SequenceBackground = { key: string } | { colour: string } | { stack: readonly string[] };

type SequencePair = (
  fgKey: string,
  bg: SequenceBackground,
  where?: {
    suffix?: string;
    at?: number | undefined;
    fills?: readonly string[];
    kind?: SequenceSurface["kind"];
  },
) => void;

// A stack's first fill is the painted region beneath any rect overlays.
function pairBackground(
  bg: SequenceBackground,
  color: (key: string) => string,
  page: string,
  fills: readonly string[],
): string {
  const backdrop = fills.reduce((below, fill) => compositeOver(fill, below), page);

  if ("stack" in bg) {
    return bg.stack.reduce((below, fill) => compositeOver(fill, below), page);
  }

  return compositeOver("key" in bg ? color(bg.key) : bg.colour, backdrop);
}

const sequencePair =
  ({ theme, page, vars, lineOf, out }: SequenceTheme): SequencePair =>
  (fgKey, bg, { suffix = "", at, fills = [], kind = "text" } = {}) => {
    const color = (key: string): string => {
      const value = vars[key];

      if (typeof value !== "string") {
        throw new Error(`${key} is not a resolved colour`);
      }

      return value;
    };

    const selector = fgKey + suffix;
    const line = at ?? lineOf(fgKey);

    try {
      const background = pairBackground(bg, color, page, fills);

      out.pairs.push({
        kind,
        selector,
        foreground: compositeOver(color(fgKey), background),
        background,
        line,
        theme,
      });
    } catch (error) {
      out.skipped.push({
        selector,
        line,
        reason: `${theme} sequence pair unparseable: ${message(error)}`,
        blocking: true,
      });
    }
  };

interface SourceLines {
  rects: number[];
  boxes: number[];
}

const scoreAuthorSequence = (pair: SequencePair, features: SequenceFeatures, lines: SourceLines): void => {
  for (const fills of features.boxedActors) {
    pair("actorTextColor", { key: "actorBkg" }, { fills });
  }

  for (const fills of features.pageActors) {
    pair(
      "actorTextColor",
      { stack: fills },
      {
        suffix: " (unboxed actor label)",
      },
    );
  }

  // A group title is drawn in the root text colour on its own group fill.
  features.groups.forEach((group, index) => {
    if (group.name.trim()) {
      pair("textColor", { stack: [group.fill] }, { suffix: ` (group ${group.name} title)`, at: lines.boxes[index] });
    }
  });

  const measure = measurer(pair, features, lines);

  measure({ foreground: "signalTextColor" }, features.signals);
  measure({ foreground: "noteTextColor", background: "noteBkgColor" }, features.notes);
  measure({ foreground: "labelTextColor", background: "labelBoxBkgColor" }, features.frameLabels);
  measure({ foreground: "loopTextColor" }, features.frameTexts);
  measure({ foreground: "sequenceNumberColor", background: "signalColor" }, features.numbers);
  measure({ foreground: "signalColor", kind: "connector" }, features.messageLines, " (message line)");
  measure({ foreground: "actorLineColor", kind: "connector" }, features.lifelines, " (lifeline)");
};

type Measure = (
  keys: { foreground: string; background?: string; kind?: SequenceSurface["kind"] },
  backdrops: SequenceBackdrop[],
  label?: string,
) => void;

// Unnamed groups are numbered from one in declaration order.
function groupSuffix(features: SequenceFeatures, region: SequenceRegion): string {
  if (region.group === undefined) {
    return "";
  }

  return ` (in group ${features.groups[region.group]?.name || region.group + 1})`;
}

// Each backdrop is measured once per region it can overlap: the region's
// fill composited over the page, then any rect fills in statement order.
const measurer =
  (pair: SequencePair, features: SequenceFeatures, lines: SourceLines): Measure =>
  (keys, backdrops, label = "") => {
    const placed = backdrops.flatMap(({ regions, fills, rect }) => regions.map((region) => ({ region, fills, rect })));

    for (const { region, fills, rect } of placed) {
      const stack = [region.fill, ...fills];
      const background: SequenceBackground = keys.background ? { key: keys.background } : { stack };

      const placement = rectPlacement(rect, lines);

      pair(keys.foreground, background, {
        fills: stack,
        suffix: `${label}${placement.suffix}${groupSuffix(features, region)}`,
        at: placement.at,
        kind: keys.kind ?? "text",
      });
    }
  };

// Labels inside a rect report at the rect's source line.
function rectPlacement(rect: number | undefined, lines: SourceLines): { suffix: string; at: number | undefined } {
  return rect === undefined ? { suffix: "", at: undefined } : { suffix: " (rect)", at: lines.rects[rect] };
}

// Geometry that cannot be placed blocks every label that depends on it.
function omitUnmeasurableLabels(
  features: SequenceFeatures,
  block: (selector: string, reason: string) => ContrastResult,
): void {
  if (!features.unmeasurable.length) {
    return;
  }

  for (const { selector, reason } of features.unmeasurable) {
    block(selector, reason);
  }

  features.signals = [];
  features.notes = [];
  features.frameLabels = [];
  features.frameTexts = [];
  features.numbers = [];
  features.messageLines = [];
  features.lifelines = [];
}

export const scoreSequence = async (source: string, canvas: Canvas = GITHUB_CANVAS): Promise<ContrastResult> => {
  const out: ContrastResult = { pairs: [], skipped: [] };
  const mermaid = await getMermaidCore();
  const parsed = await parseSequence(mermaid, source);

  if (!parsed) {
    return out;
  }

  const { config, db, lineOf, rectLines, boxLines } = parsed;

  const block = (selector: string, reason: string): ContrastResult => {
    out.skipped.push({
      selector,
      line: lineOf(selector),
      reason,
      blocking: true,
    });

    return out;
  };

  const problem = unmodelled(config);

  if (problem) {
    return block(problem.selector, problem.reason);
  }

  const features = sequenceFeatures(db);

  if (features.unsupportedActorTypes.length) {
    return block("actor", `participant label geometry is not modeled for ${features.unsupportedActorTypes.join(", ")}`);
  }

  omitUnmeasurableLabels(features, block);

  let variables: Record<Theme, Variables>;

  try {
    variables = resolveThemes(mermaid, config).themes;
  } catch (err) {
    // A colour the theme derives others from, such as actorBorder, fails here.
    return block("themeVariables", `Mermaid could not resolve the theme: ${message(err)}`);
  }

  for (const t of THEMES) {
    const page = canvas[t];
    const pair = sequencePair({
      theme: t,
      page,
      vars: variables[t],
      lineOf,
      out,
    });

    scoreAuthorSequence(pair, features, { rects: rectLines, boxes: boxLines });
  }

  return out;
};
