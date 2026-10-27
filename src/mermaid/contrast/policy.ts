import type { MermaidConfig } from "mermaid";
import type { Diagram } from "mermaid/dist/Diagram.js";
import type { FlowDB } from "mermaid/dist/diagrams/flowchart/flowDb.js";
import type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";
import { parseDocument } from "yaml";
import { createDocument } from "../../document/context.ts";
import type { RuleOptions } from "../../types.ts";
import { getMermaidCore } from "../parsing/engine.ts";
import type { DiagramStats } from "../parsing/statistics.ts";
import type { Report } from "../report.ts";
import { readStyles } from "../styling/declarations.ts";
import { compositeOver, wcagRatio } from "./colors.ts";
import { styledSurfaces } from "./rendered.ts";
import { scoreSequence } from "./sequence.ts";
import { familySurfaces, titleSurface } from "./surfaces.ts";
import {
  type Canvas,
  canvasColourProblem,
  GITHUB_CANVAS,
  resolveThemes,
  SUPPORTED_THEMES,
  type TextSurface,
  THEMES,
  type Theme,
  type ThemeVariables,
} from "./theme.ts";

export const CONTRAST_RULE = "mermaid/contrast-text-below-aa";
const ALIASES: Record<string, string> = {
  "flowchart-v2": "flowchart",
  "flowchart-elk": "flowchart",
  swimlane: "flowchart",
  class: "classDiagram",
  "classDiagram-v2": "classDiagram",
  er: "erDiagram",
  "stateDiagram-v2": "stateDiagram",
  state: "stateDiagram",
};

export async function reportContrast(
  source: string,
  stats: DiagramStats,
  options: RuleOptions,
  report: Report,
): Promise<void> {
  const canvas = resolvedCanvas(options);

  try {
    await contrast(source, stats, canvas, report);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    report(
      CONTRAST_RULE,
      `Contrast cannot be audited: ${reason}. Replace unsupported styling with explicit supported Mermaid colors, then verify text reaches 4.5:1 in both light and dark themes.`,
    );
  }
}

function rejectUnmodelledConfig(config: MermaidConfig): void {
  if (config.themeCSS) {
    throw new Error("custom themeCSS is not modeled");
  }

  if (config.look && config.look !== "classic") {
    throw new Error(`${config.look} rendering is not modeled`);
  }

  if (config.theme && !SUPPORTED_THEMES.includes(config.theme)) {
    throw new Error(`${config.theme} theme geometry is not modeled`);
  }
}

function diagramTitle(source: string, diagram: Diagram): unknown {
  const metadata = createDocument(source).tree.children.find((node) => node.type === "yaml");

  return diagram.db.getDiagramTitle?.() || (metadata && parseDocument(metadata.value).get("title"));
}

function rejectStyledHtml(data: ReturnType<FlowDB["getData"]>): void {
  const labels = [...data.nodes.map((node) => node.label), ...data.edges.map((edge) => edge.label)];

  rejectHtmlLabels(labels);
}

function rejectHtmlLabels(labels: unknown[]): void {
  if (labels.some((label) => typeof label === "string" && /<[^>]+\b(?:style|color|bgcolor|fill)\s*=/i.test(label))) {
    throw new Error("inline HTML label styles are not modeled");
  }
}

function rejectSequenceHtml(diagram: Diagram): void {
  const db = diagram.db as SequenceDB;

  rejectHtmlLabels([...db.getActors().values()].map((actor) => actor.description));
  rejectHtmlLabels(db.getMessages().map((message) => message.message));
}

async function sequenceSurfaces(source: string, canvas: Canvas, report: Report): Promise<void> {
  const result = await scoreSequence(source, canvas);

  for (const skipped of result.skipped.filter((item) => item.blocking)) {
    report(
      CONTRAST_RULE,
      `Contrast cannot be audited for ${skipped.selector}: ${skipped.reason}. Use supported colors and verify both light and dark themes.`,
      skipped.line,
    );
  }

  for (const pair of result.pairs.filter((item) => item.kind === "text")) {
    checkPair(
      {
        name: pair.selector,
        foreground: pair.foreground,
        background: pair.background,
        line: pair.line,
      },
      pair.theme ?? "light",
      report,
    );
  }
}

async function contrast(source: string, stats: DiagramStats, canvas: Canvas, report: Report): Promise<void> {
  const mermaid = await getMermaidCore();
  const parsed = await mermaid.parse(source);
  const config = parsed.config as MermaidConfig;

  rejectUnmodelledConfig(config);

  const styles = await readStyles(source);

  if (styles.unmodelled.length) {
    throw new Error(styles.unmodelled.map((item) => item.reason).join("; "));
  }

  const diagram = (await mermaid.mermaidAPI.getDiagramFromText(source)) as Diagram;
  const kind = ALIASES[stats.diagram_type] ?? stats.diagram_type;
  const { themes, defaults } = resolveThemes(mermaid, config);
  const run = {
    source,
    diagram,
    kind,
    config,
    themes,
    defaults,
    canvas,
    styles,
  };

  reportTitles(diagramTitle(source, diagram), run, report);

  if (kind === "sequence" || kind === "sequenceDiagram") {
    rejectSequenceHtml(diagram);

    return sequenceSurfaces(source, canvas, report);
  }

  await reportSurfaces(run, report);
}

type SurfaceRun = {
  source: string;
  diagram: Diagram;
  kind: string;
  config: MermaidConfig;
  themes: Record<Theme, ThemeVariables>;
  defaults: ThemeVariables;
  canvas: Canvas;
  styles: Awaited<ReturnType<typeof readStyles>>;
};

function reportTitles(title: unknown, run: SurfaceRun, report: Report): void {
  if (!title) {
    return;
  }

  const { kind, themes, defaults, canvas } = run;

  for (const theme of THEMES) {
    checkPair(
      {
        name: "diagram title",
        ...titleSurface(kind, themes[theme], defaults, canvas[theme]),
      },
      theme,
      report,
    );
  }
}

async function reportSurfaces(run: SurfaceRun, report: Report): Promise<void> {
  const isStyled = ["flowchart", "classDiagram", "stateDiagram", "erDiagram"].includes(run.kind);
  const data = isStyled ? (run.diagram.db as FlowDB).getData() : undefined;

  if (data) {
    rejectStyledHtml(data);
  }

  for (const theme of THEMES) {
    const ctx = {
      kind: run.kind,
      db: run.diagram.db,
      vars: run.themes[theme],
      defaults: run.defaults,
      config: run.config,
      source: run.diagram.text,
      page: run.canvas[theme],
    };
    const surfaces = data
      ? styledSurfaces({ ...ctx, data, directives: run.styles.directives })
      : await familySurfaces(ctx);

    if (surfaces === null) {
      throw new Error(`${run.kind} text surfaces are not yet modeled`);
    }

    for (const surface of surfaces) {
      checkPair(surface, theme, report);
    }
  }
}

function checkPair(surface: TextSurface, theme: Theme, report: Report): void {
  const foreground = compositeOver(surface.foreground, surface.background);
  const ratio = wcagRatio(foreground, surface.background);

  if (ratio >= 4.5) {
    return;
  }

  report(
    CONTRAST_RULE,
    `${surface.name}: text ${surface.foreground} resolves to ${foreground} on ${surface.background} in the ${theme} theme (${ratio.toFixed(2)}:1 < 4.5:1). Change the text color OR its background fill until this label reaches at least 4.5:1 in BOTH light and dark themes. Recheck both themes after editing.`,
    surface.line ?? 1,
  );
}

function resolvedCanvas(options: RuleOptions): Canvas {
  const canvas = { ...GITHUB_CANVAS, ...options.canvas };

  for (const [theme, color] of Object.entries(canvas)) {
    const problem = canvasColourProblem(color);

    if (problem) {
      throw new TypeError(`${theme} canvas ${problem}`);
    }
  }

  return canvas;
}
