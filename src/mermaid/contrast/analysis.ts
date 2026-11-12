import type { MermaidConfig } from "mermaid";
import type { Diagram } from "mermaid/dist/Diagram.js";
import type { FlowDB } from "mermaid/dist/diagrams/flowchart/flowDb.js";
import type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";
import { parseDocument } from "yaml";
import { createDocument } from "../../document/context.ts";
import { getMermaidCore } from "../parsing/engine.ts";
import type { DiagramStats } from "../parsing/statistics.ts";
import { readStyles } from "../styling/declarations.ts";
import { styledSurfaces } from "./rendered.ts";
import { scoreSequence } from "./sequence.ts";
import { familySurfaces, titleSurface } from "./surfaces.ts";
import {
  type Canvas,
  resolveThemes,
  SUPPORTED_THEMES,
  type TextSurface,
  THEMES,
  type Theme,
  type ThemeVariables,
} from "./theme.ts";

// Shared rendered-surface analysis. It discovers what Mermaid paints in each
// theme and reports styling it cannot model; policies own every threshold.

// Titles and labels are text; a connector is a line stroke such as a lifeline.
export type SurfaceKind = "title" | "label" | "connector";

export interface AnalyzedSurface {
  kind: SurfaceKind;
  name: string;
  theme: Theme;

  // The resolved text colour, which may be translucent.
  foreground: string;

  // The colour behind the text, as each surface adapter composites it over
  // its parents and the page canvas.
  background: string;

  // Diagram-relative source line, when the surface comes from authored source.
  line?: number;
}

export interface UnsupportedStyling {
  reason: string;

  // Present when a specific declaration, rather than the whole diagram, is unmodelled.
  selector?: string;
  line?: number;
}

export interface SurfaceAnalysis {
  surfaces: AnalyzedSurface[];

  // Any entry means the surfaces are incomplete and must not be treated as a full audit.
  unsupported: UnsupportedStyling[];
}

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

const STYLED_FAMILIES = ["flowchart", "classDiagram", "stateDiagram", "erDiagram"];

// Callers must hold the serial Mermaid queue; theme resolution restores the
// site configuration even when discovery fails part way.
export async function analyzeSurfaces(source: string, stats: DiagramStats, canvas: Canvas): Promise<SurfaceAnalysis> {
  const analysis: SurfaceAnalysis = { surfaces: [], unsupported: [] };

  try {
    await discover(source, stats, canvas, analysis);
  } catch (error) {
    analysis.unsupported.push({ reason: error instanceof Error ? error.message : String(error) });
  }

  return analysis;
}

type Collect = (kind: SurfaceKind, surface: TextSurface, theme: Theme) => void;

const collector =
  (analysis: SurfaceAnalysis): Collect =>
  (kind, surface, theme) => {
    analysis.surfaces.push({
      kind,
      name: surface.name,
      theme,
      foreground: surface.foreground,
      background: surface.background,
      ...(surface.line === undefined ? {} : { line: surface.line }),
    });
  };

async function discover(source: string, stats: DiagramStats, canvas: Canvas, analysis: SurfaceAnalysis): Promise<void> {
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
  const run: SurfaceRun = { diagram, kind, config, themes, defaults, canvas, styles };
  const collect = collector(analysis);

  collectTitles(diagramTitle(source, diagram), run, collect);

  if (kind === "sequence" || kind === "sequenceDiagram") {
    rejectSequenceHtml(diagram);

    return collectSequence(source, canvas, analysis, collect);
  }

  await collectFamily(run, collect);
}

type SurfaceRun = {
  diagram: Diagram;
  kind: string;
  config: MermaidConfig;
  themes: Record<Theme, ThemeVariables>;
  defaults: ThemeVariables;
  canvas: Canvas;
  styles: Awaited<ReturnType<typeof readStyles>>;
};

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

function collectTitles(title: unknown, run: SurfaceRun, collect: Collect): void {
  if (!title) {
    return;
  }

  const { kind, themes, defaults, canvas } = run;

  for (const theme of THEMES) {
    collect("title", { name: "diagram title", ...titleSurface(kind, themes[theme], defaults, canvas[theme]) }, theme);
  }
}

async function collectSequence(
  source: string,
  canvas: Canvas,
  analysis: SurfaceAnalysis,
  collect: Collect,
): Promise<void> {
  const result = await scoreSequence(source, canvas);

  for (const skipped of result.skipped.filter((item) => item.blocking)) {
    analysis.unsupported.push({ reason: skipped.reason, selector: skipped.selector, line: skipped.line });
  }

  for (const pair of result.pairs) {
    collect(
      pair.kind === "connector" ? "connector" : "label",
      { name: pair.selector, foreground: pair.foreground, background: pair.background, line: pair.line },
      pair.theme,
    );
  }
}

async function collectFamily(run: SurfaceRun, collect: Collect): Promise<void> {
  const data = STYLED_FAMILIES.includes(run.kind) ? (run.diagram.db as FlowDB).getData() : undefined;

  if (data) {
    rejectHtmlLabels([...data.nodes.map((node) => node.label), ...data.edges.map((edge) => edge.label)]);
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
      collect("label", surface, theme);
    }
  }
}
