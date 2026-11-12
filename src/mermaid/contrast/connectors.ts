import type { Report } from "../report.ts";
import type { AnalyzedSurface, SurfaceAnalysis, UnsupportedStyling } from "./analysis.ts";
import { compositeOver, wcagRatio } from "./colors.ts";

// Connecting lines and arrowheads are graphical objects, so WCAG 1.4.11 asks
// for 3:1 against what lies behind them, independently of text contrast.

export const CONNECTOR_RULE = "mermaid/contrast-connectors-below-minimum";

const CONNECTOR_MINIMUM = 3;

export function reportConnectors(analysis: SurfaceAnalysis, report: Report): void {
  for (const surface of analysis.surfaces.filter((item) => item.kind === "connector")) {
    checkConnector(surface, report);
  }

  for (const unsupported of analysis.unsupported) {
    reportUnsupported(unsupported, report);
  }
}

function reportUnsupported({ reason, selector, line }: UnsupportedStyling, report: Report): void {
  const where = selector === undefined ? "" : ` for ${selector}`;

  report(
    CONNECTOR_RULE,
    `Connector contrast cannot be audited${where}: ${reason}. Use supported Mermaid colours, then verify lines and arrowheads reach 3:1 in both light and dark themes.`,
    line,
  );
}

function checkConnector(surface: AnalyzedSurface, report: Report): void {
  const foreground = compositeOver(surface.foreground, surface.background);
  const ratio = wcagRatio(foreground, surface.background);

  if (ratio >= CONNECTOR_MINIMUM) {
    return;
  }

  report(
    CONNECTOR_RULE,
    `${surface.name}: stroke ${surface.foreground} resolves to ${foreground} on ${surface.background} in the ${surface.theme} theme (${ratio.toFixed(2)}:1 < 3:1). Change the line colour OR the fill behind it until this connector reaches at least 3:1 in BOTH light and dark themes. Recheck both themes after editing.`,
    surface.line ?? 1,
  );
}
