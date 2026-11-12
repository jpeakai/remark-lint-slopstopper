import type { RuleOptions } from "../../types.ts";
import { alphaOf } from "./colors.ts";
import { type Canvas, canvasColourProblem, GITHUB_CANVAS, THEMES, type Theme } from "./theme.ts";

// A viewer profile describes how a host paints Mermaid. GitHub renders the
// default and dark themes on its canvas. Material for MkDocs renders the
// default theme in both palettes and restyles five families with its own CSS,
// whose colours come from the site's palette, so they must be measured.

// Measured values of Material's --md-mermaid-* and palette custom properties.
export interface HostColours {
  // --md-default-bg-color, behind the diagram and every label box.
  canvas: string;

  // --md-mermaid-label-fg-color, for node, cluster and title text.
  text: string;

  // --md-mermaid-edge-color, for edges, edge labels, messages and notes.
  edge: string;

  // --md-mermaid-node-bg-color, usually a translucent accent.
  nodeFill: string;

  // --md-mermaid-node-fg-color, for sequence frame labels and number badges.
  accent: string;

  // --md-default-fg-color--lightest, for flowchart clusters.
  clusterFill: string;

  // --md-accent-bg-color, for sequence numbers; needed only with autonumber.
  accentText?: string;
}

export type Viewer =
  | { name: "github"; canvas: Canvas }
  | { name: "mkdocs-material"; canvas: Canvas; host: Readonly<Record<Theme, HostColours>> };

// The families Material's themeCSS restyles; others keep Mermaid's theme.
export const MATERIAL_FAMILIES: ReadonlySet<string> = new Set([
  "flowchart",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "sequence",
]);

const REQUIRED: readonly (keyof HostColours)[] = ["canvas", "text", "edge", "nodeFill", "accent", "clusterFill"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function hostColours(value: unknown, theme: Theme): HostColours {
  if (!isRecord(value)) {
    throw new TypeError(`mkdocs-material needs host.${theme} with measured ${REQUIRED.join(", ")} colours`);
  }

  const missing = REQUIRED.filter((key) => value[key] === undefined);

  if (missing.length) {
    throw new TypeError(`mkdocs-material host.${theme} is missing ${missing.join(", ")}`);
  }

  for (const [key, colour] of Object.entries(value).filter(([, entry]) => entry !== undefined)) {
    if (![...REQUIRED, "accentText"].includes(key)) {
      throw new TypeError(`mkdocs-material host.${theme}.${key} is not a known anchor`);
    }

    if (typeof colour !== "string") {
      throw new TypeError(`mkdocs-material host.${theme}.${key} is not a colour string`);
    }

    try {
      alphaOf(colour);
    } catch {
      throw new TypeError(`mkdocs-material host.${theme}.${key} is not a CSS colour`);
    }
  }

  const problem = canvasColourProblem(value.canvas);

  if (problem) {
    throw new TypeError(`mkdocs-material host.${theme}.canvas ${problem}`);
  }

  return value as unknown as HostColours;
}

function githubCanvas(options: RuleOptions): Canvas {
  const canvas = { ...GITHUB_CANVAS, ...options.canvas };

  for (const [theme, color] of Object.entries(canvas)) {
    const problem = canvasColourProblem(color);

    if (problem) {
      throw new TypeError(`${theme} canvas ${problem}`);
    }
  }

  return canvas;
}

export function resolveViewer(options: RuleOptions): Viewer {
  const name = options.viewer ?? "github";

  if (name === "github") {
    if (options.host !== undefined) {
      throw new TypeError("host colours apply only to the mkdocs-material viewer");
    }

    return { name, canvas: githubCanvas(options) };
  }

  if (name !== "mkdocs-material") {
    throw new TypeError(`viewer ${String(name)} is not github or mkdocs-material`);
  }

  if (options.canvas !== undefined) {
    throw new TypeError("mkdocs-material takes its canvas from host.light.canvas and host.dark.canvas");
  }

  const raw = isRecord(options.host) ? options.host : {};
  const host = Object.fromEntries(THEMES.map((theme) => [theme, hostColours(raw[theme], theme)])) as Record<
    Theme,
    HostColours
  >;

  return { name, canvas: { light: host.light.canvas, dark: host.dark.canvas }, host };
}

// The Mermaid theme each viewer mode renders with when a diagram pins none.
export const modeThemes = (viewer: Viewer): Record<Theme, string> =>
  viewer.name === "github" ? { light: "default", dark: "dark" } : { light: "default", dark: "default" };
