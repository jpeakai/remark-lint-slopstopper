import type { PieDB } from "mermaid/dist/diagrams/pie/pieTypes.js";
import type { RadarDB } from "mermaid/dist/diagrams/radar/types.js";
import { withOpacity } from "../colors.ts";
import type { AddSurface, SurfaceContext } from "../theme.ts";

type SankeyDB = typeof import("mermaid/dist/diagrams/sankey/sankeyDB.js").default;
type XYChartDB = typeof import("mermaid/dist/diagrams/xychart/xychartDb.js").default;
type QuadrantDB = typeof import("mermaid/dist/diagrams/quadrant-chart/quadrantDb.js").default;

export function pieSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, config } = ctx;
  const db = ctx.db as PieDB;

  let index = 1;
  const total = [...db.getSections().values()].reduce((sum, n) => sum + n, 0);

  for (const [label, value] of db.getSections()) {
    if (Math.round((value / total) * 100) > 0) {
      add(
        `slice ${label}`,
        v.pieSectionTextColor,
        withOpacity(v[`pie${index}`], config.pie?.highlightSlice === label ? 1 : v.pieOpacity),
      );

      if (config.pie?.highlightSlice === "hover") {
        add(`highlighted slice ${label}`, v.pieSectionTextColor, v[`pie${index}`]);
      }
    }

    add(`legend ${label}`, v.pieLegendTextColor);
    index = (index % 12) + 1;
  }
}

export function sankeySurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v } = ctx;
  const db = ctx.db as SankeyDB;

  for (const node of db.getNodes()) {
    // Mermaid outlines labels with a 4px mainBkg stroke before painting
    // the foreground. That outline is the immediate letter background.
    add(node.ID, v.textColor, v.mainBkg || v.background || "#fff");
  }
}

export function xychartSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, defaults, config } = ctx;
  const db = ctx.db as XYChartDB;

  const options = {
    ...defaults.xyChart,
    ...v.xyChart,
    ...config.themeVariables?.xyChart,
  };
  const background = options.backgroundColor;
  const data = db.getXYChartData();

  if (data.title && config.xyChart?.showTitle !== false) {
    add("titleColor", options.titleColor, background);
  }

  for (const axis of ["xAxis", "yAxis"] as const) {
    if (data[axis]?.title && config.xyChart?.[axis]?.showTitle !== false) {
      add(`${axis}TitleColor`, options[`${axis}TitleColor`], background);
    }

    if (config.xyChart?.[axis]?.showLabel !== false) {
      add(`${axis}LabelColor`, options[`${axis}LabelColor`], background);
    }
  }

  if (config.xyChart?.showDataLabel) {
    add("data labels", options.dataLabelColor, background);
  }

  if (config.xyChart?.showLegend) {
    add("legend", options.legendTextColor, background);
  }
}

export function radarSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, defaults, config } = ctx;
  const db = ctx.db as RadarDB;

  const options = { ...defaults.radar, ...v.radar, ...config.radar };

  for (const axis of db.getAxes()) {
    add(`axis ${axis.name ?? axis}`, options.axisColor);
  }

  for (const curve of db.getCurves()) {
    add(`legend ${curve.name ?? "curve"}`, v.textColor);
  }
}

export function quadrantChartSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const data = (ctx.db as QuadrantDB).getQuadrantData();

  for (const [i, quadrant] of data.quadrants.entries()) {
    if (quadrant.text?.text) {
      add(`quadrant ${i + 1}`, ctx.vars[`quadrant${i + 1}TextFill`], ctx.vars[`quadrant${i + 1}Fill`]);
    }
  }

  for (const point of data.points) {
    quadrantPoint(point, data, ctx, add);
  }

  quadrantAxes(data, ctx, add);
}

type QuadrantData = ReturnType<QuadrantDB["getQuadrantData"]>;

function quadrantPoint(
  point: QuadrantData["points"][number],
  data: QuadrantData,
  ctx: SurfaceContext,
  add: AddSurface,
): void {
  if (!point.text?.text) {
    return;
  }

  const quadrant = data.quadrants.find(
    (q) => point.x >= q.x && point.x <= q.x + q.width && point.y >= q.y && point.y <= q.y + q.height,
  );
  const index = quadrant ? data.quadrants.indexOf(quadrant) + 1 : 0;

  add(`point ${point.text.text}`, ctx.vars.quadrantPointTextFill, index ? ctx.vars[`quadrant${index}Fill`] : ctx.page);
}

function quadrantAxes(data: QuadrantData, ctx: SurfaceContext, add: AddSurface): void {
  for (const axis of data.axisLabels ?? []) {
    if (!axis.text) {
      continue;
    }

    add(`axis ${axis.text}`, axis.rotation ? ctx.vars.quadrantYAxisTextFill : ctx.vars.quadrantXAxisTextFill);
  }
}
