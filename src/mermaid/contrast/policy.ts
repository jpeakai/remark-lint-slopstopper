import type { Report } from "../report.ts";
import type { AnalyzedSurface, SurfaceAnalysis, UnsupportedStyling } from "./analysis.ts";
import { compositeOver, wcagRatio } from "./colors.ts";

export const CONTRAST_RULE = "mermaid/contrast-text-below-aa";

const TEXT_AA = 4.5;

export function reportContrast(analysis: SurfaceAnalysis, report: Report): void {
  for (const surface of analysis.surfaces.filter((item) => item.kind !== "connector")) {
    checkText(surface, report);
  }

  for (const unsupported of analysis.unsupported.filter((item) => item.scope !== "connector")) {
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
