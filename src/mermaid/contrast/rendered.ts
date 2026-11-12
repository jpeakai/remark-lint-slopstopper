import Color from "colorjs.io";
import type { MermaidConfig } from "mermaid";
import type { Edge, LayoutData, Node } from "mermaid/dist/rendering-util/types.js";
import { propertiesOf } from "../styling/properties.ts";
import type { StyleDirective } from "../styling/types.ts";
import { alphaOf, compositeOver, withOpacity } from "./colors.ts";
import type { TextSurface, ThemeVariables } from "./theme.ts";
import type { HostColours } from "./viewer.ts";

type RenderNode = Node & { styles?: string[]; attributes?: readonly unknown[] };
interface PaintContext {
  kind: string;
  data: LayoutData;
  vars: ThemeVariables;
  page: string;
  config: MermaidConfig;
  directives: StyleDirective[];

  // Material for MkDocs colours, when its CSS restyles this family. Its rules
  // beat theme variables but lose to authored inline styles.
  host?: HostColours | undefined;
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
const isContainer = (node: RenderNode): boolean => node.isGroup && node.shape !== "noteGroup";
const isNote = (node: RenderNode): boolean => node.shape === "note";

function properties(node: RenderNode): Record<string, string> {
  const result = propertiesOf([...(node.cssCompiledStyles ?? []), ...(node.styles ?? []), ...(node.cssStyles ?? [])]);
  const unsupported = Object.keys(result).filter((key) => !SUPPORTED_PROPERTIES.has(key));

  if (unsupported.length) {
    throw new Error(`${node.id} has unsupported style properties ${unsupported.join(", ")}`);
  }

  return result;
}

// Material's .node, .cluster and .statediagram-cluster rules, measured on
// Mermaid 11.17.2: class notes keep the theme, state notes take the node fill,
// and a composite state's inner box shows the label background.
function hostFill(node: RenderNode, ctx: PaintContext): string | undefined {
  const { host } = ctx;

  if (!host || (isNote(node) && ctx.kind === "classDiagram")) {
    return;
  }

  if (!isContainer(node)) {
    return host.nodeFill;
  }

  return ctx.kind === "stateDiagram" ? host.canvas : host.clusterFill;
}

function defaultFill(node: RenderNode, ctx: PaintContext): string {
  if (node.shape === "noteGroup") {
    return "transparent";
  }

  const hosted = hostFill(node, ctx);

  if (hosted) {
    return hosted;
  }

  if (isNote(node)) {
    return ctx.vars.noteBkgColor;
  }

  if (isContainer(node)) {
    return containerFill(node, ctx);
  }

  return ctx.kind === "stateDiagram" ? ctx.vars.stateBkg : ctx.vars.mainBkg;
}

function containerFill(node: RenderNode, ctx: PaintContext): string {
  if (ctx.kind !== "stateDiagram") {
    return ctx.vars.clusterBkg;
  }

  if (node.cssClasses?.includes("statediagram-cluster-alt")) {
    return ctx.vars.altBackground ?? "#efefef";
  }

  return ctx.vars.compositeBackground;
}

function defaultText(node: RenderNode, ctx: PaintContext): string {
  if (isNote(node)) {
    return ctx.vars.noteTextColor;
  }

  if (ctx.host) {
    return ctx.host.text;
  }

  if (isContainer(node)) {
    return ctx.kind === "stateDiagram" ? ctx.vars.stateLabelColor : ctx.vars.titleColor;
  }

  const byKind: Record<string, string> = {
    classDiagram: "classText",
    stateDiagram: "stateLabelColor",
  };

  return ctx.vars[byKind[ctx.kind] ?? "nodeTextColor"] ?? ctx.vars.textColor;
}

function directiveLine(node: RenderNode, directives: StyleDirective[]): number {
  const own = directives.find((item) => item.kind === "style" && item.selector === node.id);

  if (own) {
    return own.line;
  }

  const classes = new Set(node.cssClasses?.split(/\s+/));

  return directives.find((item) => classes.has(item.selector))?.line ?? 1;
}

function backdropReader(ctx: PaintContext, nodes: Map<string, RenderNode>) {
  return function background(id?: string, seen = new Set<string>()): string {
    const node = id ? nodes.get(id) : undefined;

    if (!node) {
      return ctx.page;
    }

    if (seen.has(node.id)) {
      throw new Error("cyclic Mermaid container containment");
    }

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
  if (ctx.kind !== "stateDiagram" || !isContainer(node)) {
    return background(node.id);
  }

  return compositeOver(own.fill ?? ctx.host?.nodeFill ?? ctx.vars.compositeTitleBackground, background(node.parentId));
}

function nodeSurfaces(node: RenderNode, ctx: PaintContext, background: (id?: string) => string): TextSurface[] {
  if (node.shape === "noteGroup") {
    return [];
  }

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

  if (ctx.kind !== "erDiagram" || !node.attributes?.length) {
    return result;
  }

  return [...result, ...erRows(node, ctx, own, { foreground, background: bg })];
}

// Material repaints both ER row stripes with its node fill.
function erRows(
  node: RenderNode,
  ctx: PaintContext,
  own: Record<string, string>,
  paint: { foreground: string; background: string },
): TextSurface[] {
  const rows = ctx.host
    ? [ctx.host.nodeFill, own.fill ?? ctx.host.nodeFill]
    : [ctx.vars.rowOdd, own.fill ?? ctx.vars.rowEven];

  return rows.map((fill, i) => ({
    name: `${node.label ?? node.id} ${i ? "rowEven" : "rowOdd"}`,
    foreground: paint.foreground,
    background: compositeOver(fill, paint.background),
    line: directiveLine(node, ctx.directives),
  }));
}

function htmlLabelBackground(ctx: PaintContext): string {
  const box = ctx.vars.edgeLabelBackground;
  const backing = new Color(ctx.kind === "erDiagram" ? ctx.vars.tertiaryColor : box);

  backing.alpha = 0.5;

  return compositeOver(box, compositeOver(box, compositeOver(backing.toString(), ctx.page)));
}

function edgeBackground(ctx: PaintContext): string {
  if (ctx.host) {
    return ctx.host.canvas;
  }

  if (ctx.kind === "classDiagram") {
    return compositeOver(ctx.vars.mainBkg, ctx.page);
  }

  const html = ctx.config.htmlLabels ?? ctx.config.flowchart?.htmlLabels ?? true;

  if (html) {
    return htmlLabelBackground(ctx);
  }

  const box = ctx.kind === "stateDiagram" ? ctx.vars.labelBackgroundColor : ctx.vars.edgeLabelBackground;

  return compositeOver(withOpacity(box, 0.5), ctx.page);
}

function edgeText(edge: Edge, ctx: PaintContext): string {
  if (ctx.host) {
    return propertiesOf(edgeStyles(edge)).color ?? ctx.host.edge;
  }

  if (ctx.kind === "classDiagram") {
    return ctx.vars.classText;
  }

  if (ctx.kind === "stateDiagram") {
    return ctx.vars.transitionLabelColor ?? ctx.vars.tertiaryTextColor;
  }

  const own = propertiesOf([...(edge.cssCompiledStyles ?? []), ...(edge.style ?? [])]);

  return own.color ?? ctx.vars.textColor;
}

function edgeSurfaces(ctx: PaintContext): TextSurface[] {
  const out: TextSurface[] = [];
  const background = edgeBackground(ctx);

  for (const [index, edge] of ctx.data.edges.entries()) {
    if (!edge.label) {
      continue;
    }

    const directive = ctx.directives.find(
      (item) => item.kind === "linkStyle" && [String(index), "default"].includes(item.selector),
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
  const nodes = new Map(ctx.data.nodes.map((node) => [node.id, node as RenderNode]));
  const background = backdropReader(ctx, nodes);

  return [...ctx.data.nodes.flatMap((node) => nodeSurfaces(node, ctx, background)), ...edgeSurfaces(ctx)];
}

// Connector strokes, measured by a separate policy. Mermaid 11.17.2 paints an
// edge and its arrowhead in the family's line colour unless a link style
// sets `stroke`; `stroke-opacity` dims only the line, `opacity` both.
const EDGE_STROKE: Record<string, string> = { stateDiagram: "transitionColor" };
const NO_MARKER = new Set(["none", "arrow_open"]);
const HIDDEN = new Set(["none", "transparent"]);

// Keep the authored colour text unless opacity changes it.
const paint = (stroke: string, alpha: number): string => (alpha === 1 ? stroke : withOpacity(stroke, alpha));

export interface Connectors {
  surfaces: TextSurface[];
  unsupported: string[];
}

function edgeStyles(edge: Edge): string[] {
  const own = (edge as { style?: string | string[] }).style;

  return [...(edge.cssCompiledStyles ?? []), ...(Array.isArray(own) ? own : own ? [own] : [])];
}

function ancestors(nodes: Map<string, RenderNode>, id: string): string[] {
  const out: string[] = [];

  for (let parent = nodes.get(id)?.parentId; parent && !out.includes(parent); parent = nodes.get(parent)?.parentId) {
    out.push(parent);
  }

  return out;
}

// An edge crosses every container between each end and their closest shared
// container, so each of those backdrops is a candidate behind the line.
function lineBackdrops(nodes: Map<string, RenderNode>, background: (id?: string) => string, edge: Edge): string[] {
  const from = ancestors(nodes, edge.start ?? "");
  const to = ancestors(nodes, edge.end ?? "");
  const shared = from.find((id) => to.includes(id));
  const crossed = [
    ...from.slice(0, shared ? from.indexOf(shared) : from.length),
    ...to.slice(0, shared ? to.indexOf(shared) : to.length),
  ];

  return [...new Set([...crossed.map((id) => background(id)), background(shared)])];
}

function strokeOf(edge: Edge, ctx: PaintContext): { stroke: string; dim: number; whole: number } {
  const own = propertiesOf(edgeStyles(edge));
  const stroke = own.stroke ?? ctx.host?.edge ?? ctx.vars[EDGE_STROKE[ctx.kind] ?? "lineColor"];

  if (typeof stroke !== "string") {
    throw new Error(`edge ${edge.id} has no resolved stroke colour`);
  }

  return {
    stroke,
    dim: Number(own["stroke-opacity"] ?? 1),
    whole: Number(own.opacity ?? 1),
  };
}

function edgeName(nodes: Map<string, RenderNode>, edge: Edge): string {
  const label = (id = "") => {
    const node = nodes.get(id);

    return (typeof node?.label === "string" && node.label.trim()) || id;
  };

  return `edge ${label(edge.start)} → ${label(edge.end)}`;
}

interface Scene {
  ctx: PaintContext;
  nodes: Map<string, RenderNode>;
  background: (id?: string) => string;
}

function edgeConnectors(edge: Edge, index: number, { ctx, nodes, background }: Scene): TextSurface[] {
  const { stroke, dim, whole } = strokeOf(edge, ctx);

  if (edge.thickness === "invisible" || HIDDEN.has(stroke.trim().toLowerCase())) {
    return [];
  }

  try {
    alphaOf(stroke);
  } catch {
    throw new Error(`edge ${edge.id} stroke ${stroke} is not a CSS colour`);
  }

  const directive = ctx.directives.find(
    (item) => item.kind === "linkStyle" && [String(index), "default"].includes(item.selector),
  );
  const line = directive?.line ?? 1;
  const name = edgeName(nodes, edge);
  const surfaces = lineBackdrops(nodes, background, edge).map((bg) => ({
    name: `${name} line`,
    foreground: paint(stroke, dim * whole),
    background: bg,
    line,
  }));
  const markers = [
    [edge.arrowTypeStart, edge.start],
    [edge.arrowTypeEnd, edge.end],
  ].filter(([type]) => type && !NO_MARKER.has(type));

  for (const [, end] of markers) {
    surfaces.push({
      name: `${name} arrowhead`,
      foreground: paint(stroke, whole),
      background: background(nodes.get(end ?? "")?.parentId),
      line,
    });
  }

  return surfaces;
}

export function styledConnectors(ctx: PaintContext): Connectors {
  const nodes = new Map(ctx.data.nodes.map((node) => [node.id, node as RenderNode]));
  const background = backdropReader(ctx, nodes);
  const out: Connectors = { surfaces: [], unsupported: [] };

  for (const [index, edge] of ctx.data.edges.entries()) {
    try {
      out.surfaces.push(...edgeConnectors(edge, index, { ctx, nodes, background }));
    } catch (error) {
      out.unsupported.push(error instanceof Error ? error.message : String(error));
    }
  }

  return out;
}
