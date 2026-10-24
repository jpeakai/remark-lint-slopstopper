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
export type AddSurface = (
  name: string,
  foreground: string | undefined,
  background?: string,
) => void;

// Shared host canvas validation and Mermaid theme transactions.

export type Theme = "light" | "dark";

export type Canvas = Readonly<Record<Theme, string>>;

export const GITHUB_CANVAS: Canvas = { light: "#ffffff", dark: "#0d1117" };

export const THEMES: readonly Theme[] = ["light", "dark"];

export const canvasColourProblem = (value: unknown): string | null => {
  if (typeof value !== "string") return "is not a colour string";
  let alpha: number;
  try {
    alpha = alphaOf(value);
  } catch {
    return "is not a CSS colour";
  }
  return alpha < 1 ? "is translucent, and a page canvas must be opaque" : null;
};

type MermaidTheme = NonNullable<MermaidConfig["theme"]>;
export const SUPPORTED_THEMES: readonly MermaidTheme[] = [
  "base",
  "default",
  "dark",
  "forest",
  "neutral",
];

export function resolveThemes(
  mermaid: MermaidCore,
  config: MermaidConfig,
): { themes: Record<Theme, ThemeVariables>; defaults: ThemeVariables } {
  const prior = mermaid.mermaidAPI.getSiteConfig();
  const themes = {} as Record<Theme, ThemeVariables>;
  try {
    mermaid.initialize({ theme: "default" });
    const defaults = mermaid.mermaidAPI.getSiteConfig().themeVariables;
    for (const theme of THEMES) {
      mermaid.initialize({
        ...structuredClone(config),
        theme: config.theme ?? (theme === "light" ? "default" : "dark"),
        themeVariables: { ...config.themeVariables },
      });
      themes[theme] = {
        ...(mermaid.mermaidAPI.getSiteConfig()
          .themeVariables as ThemeVariables),
      };
    }
    return { themes, defaults };
  } finally {
    mermaid.initialize(prior);
  }
}
