import { compositeOver } from "./colors.ts";
import {
  pieSurfaces,
  quadrantChartSurfaces,
  radarSurfaces,
  sankeySurfaces,
  xychartSurfaces,
} from "./surfaces/charts.ts";
import {
  architectureSurfaces,
  blockSurfaces,
  c4Surfaces,
  eventmodelingSurfaces,
  packetSurfaces,
  requirementSurfaces,
} from "./surfaces/models.ts";
import {
  ganttSurfaces,
  gitGraphSurfaces,
  journeySurfaces,
  kanbanSurfaces,
  timelineSurfaces,
  wardleySurfaces,
} from "./surfaces/planning.ts";
import { cynefinSurfaces, vennSurfaces } from "./surfaces/regions.ts";
import {
  ishikawaSurfaces,
  mindmapSurfaces,
  railroadSurfaces,
  treemapSurfaces,
  treeViewSurfaces,
} from "./surfaces/trees.ts";
import type { AddSurface, SurfaceContext, TextSurface, ThemeVariables } from "./theme.ts";

// Each family's title paint on the page, where it differs from titleColor.
const PAGE_TITLES: Record<string, (vars: ThemeVariables, defaults: ThemeVariables) => string | undefined> = {
  pie: (vars) => vars.pieTitleTextColor ?? vars.titleColor,
  venn: (vars) => vars.vennTitleTextColor ?? vars.titleColor,
  quadrantChart: (vars) => vars.quadrantTitleFill ?? vars.titleColor,

  // A C4 title has no fill of its own and inherits the root text paint.
  c4: (vars) => vars.textColor,
  packet: (vars) => vars.packet?.titleColor ?? "black",
  treemap: (vars) => vars.treemap?.titleColor ?? vars.titleColor,
  cynefin: (vars, defaults) => vars.cynefin?.labelColor ?? defaults.cynefin.labelColor,
};

export function titleSurface(
  kind: string,
  vars: ThemeVariables,
  defaults: ThemeVariables,
  page: string,
): Omit<TextSurface, "name"> {
  if (kind === "xychart") {
    const xy = { ...defaults.xyChart, ...vars.xyChart };

    return { foreground: xy.titleColor, background: xy.backgroundColor };
  }

  const paint = PAGE_TITLES[kind];

  return { foreground: paint ? paint(vars, defaults) : (vars.titleColor ?? vars.textColor), background: page };
}

type SurfaceAdapter = (ctx: SurfaceContext, add: AddSurface) => void | Promise<void>;

const ADAPTERS: Record<string, SurfaceAdapter> = {
  info: (ctx, add) => add("Mermaid version", ctx.vars.textColor),
  pie: pieSurfaces,
  mindmap: mindmapSurfaces,
  gantt: ganttSurfaces,
  gitGraph: gitGraphSurfaces,
  packet: packetSurfaces,
  treemap: treemapSurfaces,
  sankey: sankeySurfaces,
  ishikawa: ishikawaSurfaces,
  kanban: kanbanSurfaces,
  xychart: xychartSurfaces,
  radar: radarSurfaces,
  quadrantChart: quadrantChartSurfaces,
  requirement: requirementSurfaces,
  journey: journeySurfaces,
  timeline: timelineSurfaces,
  block: blockSurfaces,
  architecture: architectureSurfaces,
  c4: c4Surfaces,
  treeView: treeViewSurfaces,
  wardley: wardleySurfaces,
  venn: vennSurfaces,
  railroad: railroadSurfaces,
  railroadEbnf: railroadSurfaces,
  railroadAbnf: railroadSurfaces,
  railroadPeg: railroadSurfaces,
  cynefin: cynefinSurfaces,
  eventmodeling: eventmodelingSurfaces,
};

// Adapters mirror Mermaid 11.17.2's renderer surfaces using its official DBs.
// Only the collector owns result storage, validation and canvas compositing.
export async function familySurfaces(ctx: SurfaceContext): Promise<TextSurface[] | null> {
  const adapter = ADAPTERS[ctx.kind];

  if (!adapter) {
    return null;
  }

  const out: TextSurface[] = [];
  const add: AddSurface = (name, foreground, background = ctx.page) => {
    if (/<[^>]+\b(?:style|color|bgcolor|fill)\s*=/i.test(name)) {
      throw new Error("inline HTML label styles are not modeled");
    }

    if (foreground === undefined || background === undefined) {
      throw new Error(`${ctx.kind} ${name} has unresolved theme colors`);
    }

    out.push({
      name,
      foreground,
      background: compositeOver(background, ctx.page),
    });
  };

  await adapter(ctx, add);

  return out;
}
