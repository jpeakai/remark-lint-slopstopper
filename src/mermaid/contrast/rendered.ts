import Color from "colorjs.io";
import type { MermaidConfig } from "mermaid";
import type {
  Edge,
  LayoutData,
  Node,
} from "mermaid/dist/rendering-util/types.js";
import { propertiesOf } from "../styling/properties.ts";
import type { StyleDirective } from "../styling/types.ts";
import { compositeOver, withOpacity } from "./colors.ts";
import type { TextSurface, ThemeVariables } from "./theme.ts";

type RenderNode = Node & { styles?: string[]; attributes?: readonly unknown[] };
interface PaintContext {
  kind: string;
  data: LayoutData;
  vars: ThemeVariables;
  page: string;
  config: MermaidConfig;
  directives: StyleDirective[];
}
const SUPPORTED_PROPERTIES = new Set([
  "fill",
  "color",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "font-size",
  "font-weight",
  "rx",
  "ry",
]);
const isContainer = (node: RenderNode): boolean =>
  node.isGroup && node.shape !== "noteGroup";
const isNote = (node: RenderNode): boolean => node.shape === "note";

function properties(node: RenderNode): Record<string, string> {
  const result = propertiesOf([
    ...(node.cssCompiledStyles ?? []),
    ...(node.styles ?? []),
    ...(node.cssStyles ?? []),
  ]);
  const unsupported = Object.keys(result).filter(
    (key) => !SUPPORTED_PROPERTIES.has(key),
  );
  if (unsupported.length)
    throw new Error(
      `${node.id} has unsupported style properties ${unsupported.join(", ")}`,
    );
  return result;
}
function defaultFill(node: RenderNode, ctx: PaintContext): string {
  if (node.shape === "noteGroup") return "transparent";
  if (isNote(node)) return ctx.vars.noteBkgColor;
  if (isContainer(node)) return containerFill(node, ctx);
  return ctx.kind === "stateDiagram" ? ctx.vars.stateBkg : ctx.vars.mainBkg;
}
function containerFill(node: RenderNode, ctx: PaintContext): string {
  if (ctx.kind !== "stateDiagram") return ctx.vars.clusterBkg;
  if (node.cssClasses?.includes("statediagram-cluster-alt"))
    return ctx.vars.altBackground ?? "#efefef";
  return ctx.vars.compositeBackground;
}
function defaultText(node: RenderNode, ctx: PaintContext): string {
  if (isNote(node)) return ctx.vars.noteTextColor;
  if (isContainer(node))
    return ctx.kind === "stateDiagram"
      ? ctx.vars.stateLabelColor
      : ctx.vars.titleColor;
  const byKind: Record<string, string> = {
    classDiagram: "classText",
    stateDiagram: "stateLabelColor",
  };
  return ctx.vars[byKind[ctx.kind] ?? "nodeTextColor"] ?? ctx.vars.textColor;
}
function directiveLine(node: RenderNode, directives: StyleDirective[]): number {
  const own = directives.find(
    (item) => item.kind === "style" && item.selector === node.id,
  );
  if (own) return own.line;
  const classes = new Set(node.cssClasses?.split(/\s+/));
  return directives.find((item) => classes.has(item.selector))?.line ?? 1;
}
function backdropReader(ctx: PaintContext, nodes: Map<string, RenderNode>) {
  return function background(id?: string, seen = new Set<string>()): string {
    const node = id ? nodes.get(id) : undefined;
    if (!node) return ctx.page;
    if (seen.has(node.id))
      throw new Error("cyclic Mermaid container containment");
    seen.add(node.id);
    const fill = properties(node).fill ?? defaultFill(node, ctx);
    return compositeOver(fill, background(node.parentId, seen));
  };
}
function stateTitleBackground(
  node: RenderNode,
  ctx: PaintContext,
  own: Record<string, string>,
  background: (id?: string) => string,
): string {
  if (ctx.kind !== "stateDiagram" || !isContainer(node))
    return background(node.id);
  return compositeOver(
    own.fill ?? ctx.vars.compositeTitleBackground,
    background(node.parentId),
  );
}
function nodeSurfaces(
  node: RenderNode,
  ctx: PaintContext,
  background: (id?: string) => string,
): TextSurface[] {
  if (node.shape === "noteGroup") return [];
  const own = properties(node);
  const foreground = own.color ?? defaultText(node, ctx);
  const bg = stateTitleBackground(node, ctx, own, background);
  const result: TextSurface[] = [
    {
      name: isNote(node) ? `note ${node.id}` : node.id,
      foreground,
      background: bg,
      line: directiveLine(node, ctx.directives),
    },
  ];
  if (ctx.kind !== "erDiagram" || !node.attributes?.length) return result;
  const rows = [ctx.vars.rowOdd, own.fill ?? ctx.vars.rowEven];
  for (const [i, fill] of rows.entries())
    result.push({
      name: `${node.label ?? node.id} ${i ? "rowEven" : "rowOdd"}`,
      foreground,
      background: compositeOver(fill, bg),
      line: directiveLine(node, ctx.directives),
    });
  return result;
}
function htmlLabelBackground(ctx: PaintContext): string {
  const box = ctx.vars.edgeLabelBackground;
  const backing = new Color(
    ctx.kind === "erDiagram" ? ctx.vars.tertiaryColor : box,
  );
  backing.alpha = 0.5;
  return compositeOver(
    box,
    compositeOver(box, compositeOver(backing.toString(), ctx.page)),
  );
}
function edgeBackground(ctx: PaintContext): string {
  if (ctx.kind === "classDiagram")
    return compositeOver(ctx.vars.mainBkg, ctx.page);
  const html =
    ctx.config.htmlLabels ?? ctx.config.flowchart?.htmlLabels ?? true;
  if (html) return htmlLabelBackground(ctx);
  const box =
    ctx.kind === "stateDiagram"
      ? ctx.vars.labelBackgroundColor
      : ctx.vars.edgeLabelBackground;
  return compositeOver(withOpacity(box, 0.5), ctx.page);
}
function edgeText(edge: Edge, ctx: PaintContext): string {
  if (ctx.kind === "classDiagram") return ctx.vars.classText;
  if (ctx.kind === "stateDiagram")
    return ctx.vars.transitionLabelColor ?? ctx.vars.tertiaryTextColor;
  const own = propertiesOf([
    ...(edge.cssCompiledStyles ?? []),
    ...(edge.style ?? []),
  ]);
  return own.color ?? ctx.vars.textColor;
}
function edgeSurfaces(ctx: PaintContext): TextSurface[] {
  const out: TextSurface[] = [];
  const background = edgeBackground(ctx);
  for (const [index, edge] of ctx.data.edges.entries()) {
    if (!edge.label) continue;
    const directive = ctx.directives.find(
      (item) =>
        item.kind === "linkStyle" &&
        [String(index), "default"].includes(item.selector),
    );
    out.push({
      name: `edge ${ctx.kind === "flowchart" ? index : edge.id}`,
      foreground: edgeText(edge, ctx),
      background,
      line: directive?.line ?? 1,
    });
  }
  return out;
}
export function styledSurfaces(ctx: PaintContext): TextSurface[] {
  const nodes = new Map(
    ctx.data.nodes.map((node) => [node.id, node as RenderNode]),
  );
  const background = backdropReader(ctx, nodes);
  return [
    ...ctx.data.nodes.flatMap((node) => nodeSurfaces(node, ctx, background)),
    ...edgeSurfaces(ctx),
  ];
}
