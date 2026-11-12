import type { RuleOptions } from "../../types.ts";
import type { DiagramStats } from "../parsing/statistics.ts";
import type { Report } from "../report.ts";
import { type AnalyzedSurface, analyzeSurfaces, type UnsupportedStyling } from "./analysis.ts";
import { compositeOver, wcagRatio } from "./colors.ts";
import { type Canvas, canvasColourProblem, GITHUB_CANVAS } from "./theme.ts";

export const CONTRAST_RULE = "mermaid/contrast-text-below-aa";

const TEXT_AA = 4.5;

export async function reportContrast(
  source: string,
  stats: DiagramStats,
  options: RuleOptions,
  report: Report,
): Promise<void> {
  const analysis = await analyzeSurfaces(source, stats, resolvedCanvas(options));

  for (const surface of analysis.surfaces) {
    checkText(surface, report);
  }

  for (const unsupported of analysis.unsupported) {
    reportUnsupported(unsupported, report);
  }
}

function reportUnsupported({ reason, selector, line }: UnsupportedStyling, report: Report): void {
  if (selector === undefined) {
    report(
      CONTRAST_RULE,
      `Contrast cannot be audited: ${reason}. Replace unsupported styling with explicit supported Mermaid colors, then verify text reaches 4.5:1 in both light and dark themes.`,
      line,
    );

    return;
  }

  report(
    CONTRAST_RULE,
    `Contrast cannot be audited for ${selector}: ${reason}. Use supported colors and verify both light and dark themes.`,
    line,
  );
}

function checkText(surface: AnalyzedSurface, report: Report): void {
  const foreground = compositeOver(surface.foreground, surface.background);
  const ratio = wcagRatio(foreground, surface.background);

  if (ratio >= TEXT_AA) {
    return;
  }

  report(
    CONTRAST_RULE,
    `${surface.name}: text ${surface.foreground} resolves to ${foreground} on ${surface.background} in the ${surface.theme} theme (${ratio.toFixed(2)}:1 < 4.5:1). Change the text color OR its background fill until this label reaches at least 4.5:1 in BOTH light and dark themes. Recheck both themes after editing.`,
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
