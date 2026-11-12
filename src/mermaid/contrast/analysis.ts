import type { MermaidConfig } from "mermaid";
import type { Diagram } from "mermaid/dist/Diagram.js";
import type { FlowDB } from "mermaid/dist/diagrams/flowchart/flowDb.js";
import type { SequenceDB } from "mermaid/dist/diagrams/sequence/sequenceDb.js";
import { parseDocument } from "yaml";
import { createDocument } from "../../document/context.ts";
import { getMermaidCore } from "../parsing/engine.ts";
import type { DiagramStats } from "../parsing/statistics.ts";
import { readStyles } from "../styling/declarations.ts";
import { styledConnectors, styledSurfaces } from "./rendered.ts";
import { scoreSequence } from "./sequence.ts";
import { familySurfaces, titleSurface } from "./surfaces.ts";
import {
  type Canvas,
  resolveThemes,
  type TextSurface,
  THEMES,
  type Theme,
  type ThemeVariables,
  themeProblem,
} from "./theme.ts";
import { type HostColours, MATERIAL_FAMILIES, modeThemes, type Viewer } from "./viewer.ts";

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

  // "connector" when only connector surfaces are incomplete; otherwise every policy is affected.
  scope?: "connector";
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

// Families whose connectors are modelled, and families that draw none: their
// lines are axes, borders or decoration rather than relationships.
const CONNECTOR_FAMILIES = new Set([...STYLED_FAMILIES, "sequence"]);
const CONNECTOR_FREE = new Set([
  "info",
  "pie",
  "quadrantChart",
  "treemap",
  "packet",
  "kanban",
  "journey",
  "timeline",
  "venn",
  "cynefin",
  "radar",
  "xychart",
  "gantt",
]);

function classifyConnectors(kind: string, analysis: SurfaceAnalysis): void {
  if (!(CONNECTOR_FAMILIES.has(kind) || CONNECTOR_FREE.has(kind))) {
    analysis.unsupported.push({ reason: `${kind} connectors are not modeled`, scope: "connector" });
  }
}

// Callers must hold the serial Mermaid queue; theme resolution restores the
// site configuration even when discovery fails part way.
export async function analyzeSurfaces(source: string, stats: DiagramStats, viewer: Viewer): Promise<SurfaceAnalysis> {
  const analysis: SurfaceAnalysis = { surfaces: [], unsupported: [] };

  try {
    await discover(source, stats, viewer, analysis);
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

async function discover(source: string, stats: DiagramStats, viewer: Viewer, analysis: SurfaceAnalysis): Promise<void> {
  const { canvas } = viewer;
  const mermaid = await getMermaidCore();
  const parsed = await mermaid.parse(source);
  const config = parsed.config as MermaidConfig;

  const kind = normalKind(stats.diagram_type);

  rejectUnmodelledConfig(config);

  const theme = themeProblem(mermaid, config.theme, kind);

  if (theme) {
    throw new Error(theme);
  }

  const styles = await readStyles(source);

  if (styles.unmodelled.length) {
    throw new Error(styles.unmodelled.map((item) => item.reason).join("; "));
  }

  const diagram = (await mermaid.mermaidAPI.getDiagramFromText(source)) as Diagram;
  const { themes, defaults } = resolveThemes(mermaid, config, modeThemes(viewer));
  const host = viewer.name === "mkdocs-material" && MATERIAL_FAMILIES.has(kind) ? viewer.host : undefined;
  const run: SurfaceRun = { diagram, kind, config, themes, defaults, canvas, styles, host };
  const collect = collector(analysis);

  collectTitles(diagramTitle(source, diagram), run, collect);

  if (kind === "sequence") {
    rejectSequenceHtml(diagram);

    return collectSequence(source, viewer, analysis, collect);
  }

  await collectFamily(run, analysis, collect);
  classifyConnectors(kind, analysis);
}

const normalKind = (type: string): string => {
  const kind = ALIASES[type] ?? type;

  return kind === "sequenceDiagram" ? "sequence" : kind;
};

type SurfaceRun = {
  diagram: Diagram;
  kind: string;
  config: MermaidConfig;
  themes: Record<Theme, ThemeVariables>;
  defaults: ThemeVariables;
  canvas: Canvas;
  styles: Awaited<ReturnType<typeof readStyles>>;
  host: Readonly<Record<Theme, HostColours>> | undefined;
};

function rejectUnmodelledConfig(config: MermaidConfig): void {
  if (config.themeCSS) {
    throw new Error("custom themeCSS is not modeled");
  }

  if (config.look && config.look !== "classic") {
    throw new Error(`${config.look} rendering is not modeled`);
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

  const { kind, themes, defaults, canvas, host } = run;

  for (const theme of THEMES) {
    const surface =
      host && HOST_TITLES.has(kind)
        ? { foreground: host[theme].text, background: canvas[theme] }
        : titleSurface(kind, themes[theme], defaults, canvas[theme]);

    collect("title", { name: "diagram title", ...surface }, theme);
  }
}

// Material's flowchartTitleText, classDiagramTitleText and statediagramTitleText rules.
const HOST_TITLES = new Set(["flowchart", "classDiagram", "stateDiagram"]);

async function collectSequence(
  source: string,
  viewer: Viewer,
  analysis: SurfaceAnalysis,
  collect: Collect,
): Promise<void> {
  const result = await scoreSequence(source, viewer);

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

async function collectFamily(run: SurfaceRun, analysis: SurfaceAnalysis, collect: Collect): Promise<void> {
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

    if (data) {
      const styled = { ...ctx, data, directives: run.styles.directives, host: run.host?.[theme] };

      collectLabels(styledSurfaces(styled), theme, collect);
      collectConnectors(styledConnectors(styled), theme, { analysis, collect });
    } else {
      const surfaces = await familySurfaces(ctx);

      if (surfaces === null) {
        throw new Error(`${run.kind} text surfaces are not yet modeled`);
      }

      collectLabels(surfaces, theme, collect);
    }
  }
}

function collectLabels(surfaces: TextSurface[], theme: Theme, collect: Collect): void {
  for (const surface of surfaces) {
    collect("label", surface, theme);
  }
}

function collectConnectors(
  connectors: ReturnType<typeof styledConnectors>,
  theme: Theme,
  { analysis, collect }: { analysis: SurfaceAnalysis; collect: Collect },
): void {
  for (const surface of connectors.surfaces) {
    collect("connector", surface, theme);
  }

  for (const reason of connectors.unsupported) {
    if (!analysis.unsupported.some((item) => item.reason === reason)) {
      analysis.unsupported.push({ reason, scope: "connector" });
    }
  }
}
