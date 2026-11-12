import type { MermaidConfig } from "mermaid";
import type { DiagramDB } from "mermaid/dist/diagram-api/types.js";
import type { MermaidCore } from "../parsing/engine.ts";
import { alphaOf } from "./colors.ts";

export type ThemeVariables = MermaidConfig["themeVariables"];
export interface TextSurface {
  name: string;
  foreground: string;
  background: string;
  line?: number;
}
export interface SurfaceContext {
  kind: string;
  db: DiagramDB;
  vars: ThemeVariables;
  defaults: ThemeVariables;
  config: MermaidConfig;
  source: string;
  page: string;
}
export type AddSurface = (name: string, foreground: string | undefined, background?: string) => void;

// Shared host canvas validation and Mermaid theme transactions.

export type Theme = "light" | "dark";

export type Canvas = Readonly<Record<Theme, string>>;

export const GITHUB_CANVAS: Canvas = { light: "#ffffff", dark: "#0d1117" };

export const THEMES: readonly Theme[] = ["light", "dark"];

export const canvasColourProblem = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return "is not a colour string";
  }

  let alpha: number;

  try {
    alpha = alphaOf(value);
  } catch {
    return "is not a CSS colour";
  }

  return alpha < 1 ? "is translucent, and a page canvas must be opaque" : null;
};

// Renderers in the pinned Mermaid that paint differently by theme name, beyond
// the theme variables they resolve. A family's surface adapter does not model
// these branches, so the named themes are unauditable for that family only.
const COLOUR_THEMES = ["redux-color", "redux-dark-color"];
const REDUX_THEMES = ["redux", "redux-dark", ...COLOUR_THEMES];

export const THEME_BRANCHES: Readonly<Record<string, readonly string[]>> = {
  sequence: COLOUR_THEMES,
  erDiagram: COLOUR_THEMES,
  gitGraph: REDUX_THEMES,
  mindmap: REDUX_THEMES,
  timeline: REDUX_THEMES,
};

// Mermaid resolves a name it does not define to its default variables without
// complaint, so a theme other than `default` that resolves identically is unknown.
function definesTheme(mermaid: MermaidCore, theme: string): boolean {
  if (theme === "default") {
    return true;
  }

  const prior = mermaid.mermaidAPI.getSiteConfig();

  try {
    mermaid.initialize({ theme: "default" });

    const fallback = JSON.stringify(mermaid.mermaidAPI.getSiteConfig().themeVariables);

    mermaid.initialize({ theme: theme as NonNullable<MermaidConfig["theme"]> });

    return JSON.stringify(mermaid.mermaidAPI.getSiteConfig().themeVariables) !== fallback;
  } finally {
    mermaid.initialize(prior);
  }
}

// Why a pinned theme cannot be audited for this family, or null when it can.
export function themeProblem(mermaid: MermaidCore, theme: string | undefined, kind: string): string | null {
  if (theme === undefined) {
    return null;
  }

  if (!definesTheme(mermaid, theme)) {
    return `Mermaid does not define a ${theme} theme`;
  }

  return THEME_BRANCHES[kind]?.includes(theme)
    ? `${kind} renders the ${theme} theme with paint the audit does not model`
    : null;
}

// Each viewer mode renders with its own Mermaid theme unless the diagram pins one.
export function resolveThemes(
  mermaid: MermaidCore,
  config: MermaidConfig,
  modes: Readonly<Record<Theme, string>> = { light: "default", dark: "dark" },
): { themes: Record<Theme, ThemeVariables>; defaults: ThemeVariables } {
  const prior = mermaid.mermaidAPI.getSiteConfig();
  const themes = {} as Record<Theme, ThemeVariables>;

  try {
    mermaid.initialize({ theme: "default" });

    const defaults = mermaid.mermaidAPI.getSiteConfig().themeVariables;

    for (const theme of THEMES) {
      mermaid.initialize({
        ...structuredClone(config),
        theme: config.theme ?? (modes[theme] as NonNullable<MermaidConfig["theme"]>),
        themeVariables: { ...config.themeVariables },
      });
      themes[theme] = {
        ...(mermaid.mermaidAPI.getSiteConfig().themeVariables as ThemeVariables),
      };
    }

    return { themes, defaults };
  } finally {
    mermaid.initialize(prior);
  }
}
