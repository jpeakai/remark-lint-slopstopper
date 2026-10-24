import type { MermaidConfig } from "mermaid";
import type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";
import { getMermaidCore, type MermaidCore } from "../parsing/engine.ts";
import { parseTraced } from "../styling/declarations.ts";
import { frontmatterLine } from "../styling/source.ts";
import { compositeOver } from "./colors.ts";
import {
  type SequenceBackdrop,
  type SequenceFeatures,
  sequenceFeatures,
} from "./sequence-model.ts";
import {
  type Canvas,
  GITHUB_CANVAS,
  resolveThemes,
  SUPPORTED_THEMES,
  THEMES,
  type Theme,
} from "./theme.ts";

// Sequence label surfaces resolved through Mermaid's parser and theme engine.
// Only text surfaces are returned; the contrast rule owns the WCAG decision.

interface SequenceSurface {
  kind: "text";
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

const message = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

type Variables = Record<string, unknown>;

interface ParsedSequence {
  config: MermaidConfig;
  db: SequenceDB;
  lineOf: (key: string) => number;
  rectLines: number[];
}

const parseSequence = async (
  mermaid: MermaidCore,
  source: string,
): Promise<ParsedSequence | null> => {
  let config: MermaidConfig;
  try {
    ({ config } = await mermaid.parse(source));
  } catch {
    return null;
  }
  const parsed = await parseTraced(source);
  if (!parsed) return null;
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
  const rectLines = tokens
    .filter((t) => t.name === "rect")
    .map((t) => sourceLine(t.line, t.endColumn) ?? keywordLine);
  return { config, db: db as unknown as SequenceDB, lineOf, rectLines };
};

const unmodelled = (
  config: MermaidConfig,
): { selector: string; reason: string } | null => {
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

type SequenceBackground =
  | { key: string }
  | { colour: string }
  | { stack: readonly string[] };

type SequencePair = (
  fgKey: string,
  bg: SequenceBackground,
  where?: {
    suffix?: string;
    at?: number | undefined;
    fills?: readonly string[];
  },
) => void;

function pairBackground(
  bg: SequenceBackground,
  color: (key: string) => string,
  page: string,
  fills: readonly string[],
): string {
  const backdrop = fills.reduce(
    (below, fill) => compositeOver(fill, below),
    page,
  );
  if ("stack" in bg)
    return bg.stack.reduce((below, fill) => compositeOver(fill, below), page);
  return compositeOver("key" in bg ? color(bg.key) : bg.colour, backdrop);
}

const sequencePair =
  ({ theme, page, vars, lineOf, out }: SequenceTheme): SequencePair =>
  (fgKey, bg, { suffix = "", at, fills = [] } = {}) => {
    const color = (key: string): string => {
      const value = vars[key];
      if (typeof value !== "string")
        throw new Error(`${key} is not a resolved colour`);
      return value;
    };
    const selector = fgKey + suffix;
    const line = at ?? lineOf(fgKey);
    try {
      const background = pairBackground(bg, color, page, fills);
      out.pairs.push({
        kind: "text",
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

const scoreAuthorSequence = (
  pair: SequencePair,
  features: SequenceFeatures,
  rectLines: number[],
): void => {
  for (const fills of features.boxedActors)
    pair("actorTextColor", { key: "actorBkg" }, { fills });
  for (const fills of features.pageActors)
    pair(
      "actorTextColor",
      { stack: fills },
      {
        suffix: " (unboxed actor label)",
      },
    );
  pairBackdrops(
    pair,
    { foreground: "signalTextColor" },
    features.signals,
    rectLines,
  );
  pairBackdrops(
    pair,
    { foreground: "noteTextColor", background: "noteBkgColor" },
    features.notes,
    rectLines,
  );
  pairBackdrops(
    pair,
    { foreground: "labelTextColor", background: "labelBoxBkgColor" },
    features.frames,
    rectLines,
  );
  pairBackdrops(
    pair,
    { foreground: "loopTextColor" },
    features.frames,
    rectLines,
  );
  pairBackdrops(
    pair,
    { foreground: "sequenceNumberColor", background: "signalColor" },
    features.numbers,
    rectLines,
  );
};

function pairBackdrops(
  pair: SequencePair,
  keys: { foreground: string; background?: string },
  backdrops: SequenceBackdrop[],
  rectLines: number[],
): void {
  for (const { fills, rect } of backdrops) {
    const where = {
      fills,
      suffix: rect === undefined ? "" : " (rect)",
      at: rect === undefined ? undefined : rectLines[rect],
    };
    const background: SequenceBackground = keys.background
      ? { key: keys.background }
      : { stack: fills };
    pair(keys.foreground, background, where);
  }
}

function omitUnplacedLabels(
  features: SequenceFeatures,
  block: (selector: string, reason: string) => ContrastResult,
): void {
  if (features.namedBoxes)
    block("box", "participant group title text styling is not modeled");
  const uncertain =
    features.paintedBoxes &&
    [features.signals, features.notes, features.frames, features.numbers].some(
      (labels) => labels.length > 0,
    );
  if (!uncertain) return;
  block(
    "box",
    "text placement across painted participant groups cannot be audited without rendered geometry",
  );
  features.signals = [];
  features.notes = [];
  features.frames = [];
  features.numbers = [];
}

export const scoreSequence = async (
  source: string,
  canvas: Canvas = GITHUB_CANVAS,
): Promise<ContrastResult> => {
  const out: ContrastResult = { pairs: [], skipped: [] };
  const mermaid = await getMermaidCore();
  const parsed = await parseSequence(mermaid, source);
  if (!parsed) return out;
  const { config, db, lineOf, rectLines } = parsed;

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
  if (problem) return block(problem.selector, problem.reason);

  const features = sequenceFeatures(db);
  if (features.unsupportedActorTypes.length)
    return block(
      "actor",
      `participant label geometry is not modeled for ${features.unsupportedActorTypes.join(", ")}`,
    );
  omitUnplacedLabels(features, block);
  let variables: Record<Theme, Variables>;
  try {
    variables = resolveThemes(mermaid, config).themes;
  } catch (err) {
    // A colour the theme derives others from, such as actorBorder, fails here.
    return block(
      "themeVariables",
      `Mermaid could not resolve the theme: ${message(err)}`,
    );
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
    scoreAuthorSequence(pair, features, rectLines);
  }
  return out;
};
