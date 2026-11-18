import { sankey as d3Sankey, sankeyCenter, sankeyJustify, sankeyLeft, sankeyRight } from "d3-sankey";
import type { MermaidConfig } from "mermaid";
import { siteConfig } from "../../compat/api.ts";
import { finite, getter, identifier, list } from "../../compat/shapes.ts";
import { getMermaidCore } from "../../parsing/engine.ts";
import { alphaOf, compositeOver, withOpacity } from "../colors.ts";
import type { AddSurface, SurfaceContext } from "../theme.ts";

// Sankey labels sit under the ribbons: Mermaid draws the links after the
// labels. Natively the ribbons multiply-blend, which a contrast ratio cannot
// model, so only one documented recipe is auditable. Ribbons blend normally
// at a fixed opacity in a single opaque colour, over labels whose geometry
// follows Mermaid's own d3-sankey layout.

export const SANKEY_RECIPE = ".link { mix-blend-mode: normal !important; stroke-opacity: 0.16; }";

const RIBBON_OPACITY = 0.16;

// The most ribbons one label may lie under; every combination is measured.
export const RIBBON_OVERLAP_LIMIT = 4;

const FONT_SIZE = 14;
const LABEL_GAP = 6;
const OUTLINE_WIDTH = 4;

export interface SankeyConfig {
  width?: number;
  height?: number;
  nodeAlignment?: "left" | "right" | "center" | "justify";
  nodeWidth?: number;
  nodePadding?: number;
  showValues?: boolean;
  prefix?: string;
  suffix?: string;
  labelStyle?: "legacy" | "outlined";
  linkColor?: string;
  nodeColors?: Record<string, string>;
}

const ALIGN = { left: sankeyLeft, right: sankeyRight, center: sankeyCenter, justify: sankeyJustify };

const opaque = (value: unknown, what: string): string => {
  if (value === undefined) {
    throw new Error(`${what} is missing; every Sankey node needs an explicit opaque colour`);
  }

  let alpha: number;

  try {
    alpha = alphaOf(String(value));
  } catch {
    throw new Error(`${what} ${String(value)} is not a CSS colour`);
  }

  if (typeof value !== "string" || alpha < 1) {
    throw new Error(`${what} ${String(value)} must be an opaque colour`);
  }

  return value;
};

function checkRecipe(config: MermaidConfig): void {
  const css = (config.themeCSS ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!css) {
    throw new Error(
      `Sankey ribbons multiply-blend over the labels, which is not modeled; use the normal-blend recipe themeCSS "${SANKEY_RECIPE}"`,
    );
  }

  const declarations = (/^\.link ?\{([^{}]*)\}$/.exec(css)?.[1] ?? "")
    .split(";")
    .map((part) => part.trim().replace(/\s*:\s*/, ": "))
    .filter(Boolean)
    .sort();

  if (JSON.stringify(declarations) !== JSON.stringify(["mix-blend-mode: normal !important", "stroke-opacity: 0.16"])) {
    throw new Error(`Sankey themeCSS must be exactly "${SANKEY_RECIPE}"`);
  }
}

interface Ribbon {
  name: string;
  colour: string;
  box: Box;
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

interface LaidNode {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  value: number;
  layer: number;
}

interface LaidLink {
  source: LaidNode;
  target: LaidNode;
  y0: number;
  y1: number;
  width: number;
}

// Mermaid's layout: d3-sankey with the renderer's own extent, padding and alignment.
function layout(nodes: string[], links: { source: string; target: string; value: number }[], conf: SankeyConfig) {
  const graph = { nodes: nodes.map((id) => ({ id })), links: links.map((link) => ({ ...link })) };
  const engine = d3Sankey<{ id: string }, object>()
    .nodeId((node) => node.id)
    .nodeWidth(conf.nodeWidth ?? 10)
    .nodePadding((conf.nodePadding ?? 12) + (conf.showValues ? 15 : 0))
    .nodeAlign(ALIGN[conf.nodeAlignment ?? "justify"])
    .extent([
      [0, 0],
      [conf.width ?? 600, conf.height ?? 600],
    ]);

  try {
    engine(graph);
  } catch (error) {
    throw new Error(
      `Sankey layout failed (${error instanceof Error ? error.message : String(error)}); circular flows are not modeled`,
    );
  }

  return graph as unknown as { nodes: LaidNode[]; links: LaidLink[] };
}

const labelText = (node: LaidNode, conf: SankeyConfig) =>
  conf.showValues
    ? `${node.id} ${conf.prefix ?? ""}${Math.round(node.value * 100) / 100}${conf.suffix ?? ""}`
    : node.id;

// A conservative box around a label's glyphs: every character up to one em
// wide, a line above and below the anchor, and the outline's reach.
function labelBox(node: LaidNode, conf: SankeyConfig, central: number): Box {
  const outlined = conf.labelStyle === "outlined";
  const start = outlined ? node.layer >= central : node.x0 < (conf.width ?? 600) / 2;
  const anchor = start ? node.x1 + LABEL_GAP : node.x0 - LABEL_GAP;
  const width = labelText(node, conf).length * FONT_SIZE;
  const reach = outlined ? OUTLINE_WIDTH / 2 : 0;
  const middle = (node.y0 + node.y1) / 2;

  return {
    left: (start ? anchor : anchor - width) - reach,
    right: (start ? anchor + width : anchor) + reach,
    top: middle - FONT_SIZE - reach,
    bottom: middle + FONT_SIZE + reach,
  };
}

// A conservative box around a ribbon: its whole stroke between the nodes.
const ribbonBox = (link: LaidLink): Box => {
  const half = Math.max(1, link.width) / 2;

  return {
    left: link.source.x1,
    right: link.target.x0,
    top: Math.min(link.y0, link.y1) - half,
    bottom: Math.max(link.y0, link.y1) + half,
  };
};

function ribbonColour(conf: SankeyConfig, source: string, target: string): string {
  const linkColor = conf.linkColor ?? "gradient";
  const node = (id: string) => opaque(conf.nodeColors?.[id], `sankey.nodeColors.${id}`);

  if (linkColor === "gradient") {
    throw new Error(
      "gradient Sankey ribbons are not modeled; set sankey.linkColor to source, target or one opaque colour",
    );
  }

  if (linkColor === "source") {
    return node(source);
  }

  return linkColor === "target" ? node(target) : opaque(linkColor, "sankey.linkColor");
}

// Every subset of the ribbons over a label, in their paint order.
function* subsets<T>(items: readonly T[]): Generator<T[]> {
  for (let mask = 0; mask < 2 ** items.length; mask++) {
    yield items.filter((_, index) => mask & (1 << index));
  }
}

export interface SankeyGraph {
  nodes: string[];
  links: { source: string; target: string; value: number }[];
}

// The flows from Mermaid's database, each with a positive finite volume.
export function readSankeyGraph(db: unknown): SankeyGraph {
  const graph = getter<{ nodes?: unknown; links?: unknown }>(db, "getGraph");
  const nodes = list<{ id?: unknown }>(graph.nodes, "getGraph().nodes").map((node) =>
    identifier(node.id, "sankey node id"),
  );
  const links = list<{ source?: unknown; target?: unknown; value?: unknown }>(graph.links, "getGraph().links").map(
    (link) => {
      const value = finite(link.value, "sankey flow value");

      if (value <= 0) {
        throw new Error(`Sankey flow value ${value} is not positive`);
      }

      return {
        source: identifier(link.source, "sankey flow source"),
        target: identifier(link.target, "sankey flow target"),
        value,
      };
    },
  );

  return { nodes, links };
}

export interface SankeyGeometry {
  nodes: LaidNode[];
  labels: Map<string, Box>;
  ribbons: { name: string; source: string; target: string; box: Box }[];
}

// Mermaid's node positions with conservative label and ribbon boxes.
export function sankeyGeometry({ nodes, links }: SankeyGraph, conf: SankeyConfig): SankeyGeometry {
  const laid = layout(nodes, links, conf);
  const central = laid.nodes.reduce((best, node) => (node.value > best.value ? node : best), {
    value: 0,
    layer: 0,
  }).layer;

  return {
    nodes: laid.nodes,
    labels: new Map(laid.nodes.map((node) => [node.id, labelBox(node, conf, central)])),
    ribbons: laid.links.map((link) => ({
      name: `${link.source.id} → ${link.target.id}`,
      source: link.source.id,
      target: link.target.id,
      box: ribbonBox(link),
    })),
  };
}

// The renderer's merged configuration: Mermaid's defaults under the diagram's own.
export const sankeyConfig = async (config: MermaidConfig): Promise<SankeyConfig> => ({
  ...(siteConfig(await getMermaidCore()).sankey as SankeyConfig),
  ...(config.sankey as SankeyConfig),
});

interface LabelPaint {
  glyph: string;
  backing: string;
  page: string;
}

// A label once for every combination of the ribbons over it, in paint order.
function measureLabel(id: string, over: Ribbon[], paint: LabelPaint, add: AddSurface): void {
  if (over.length > RIBBON_OVERLAP_LIMIT) {
    throw new Error(
      `label ${id} lies under ${over.length} ribbons, more than the ${RIBBON_OVERLAP_LIMIT} the audit combines`,
    );
  }

  for (const set of subsets(over)) {
    const tint = (base: string) => set.reduce((below, ribbon) => compositeOver(ribbon.colour, below), base);
    const under = set.length ? ` under ${set.map((ribbon) => ribbon.name).join(", ")}` : "";

    add(
      `${id}${under}`,
      tint(compositeOver(paint.glyph, paint.backing)),
      tint(compositeOver(paint.backing, paint.page)),
    );
  }
}

export async function sankeySurfaces(ctx: SurfaceContext, add: AddSurface): Promise<void> {
  checkRecipe(ctx.config);

  const conf = await sankeyConfig(ctx.config);
  const geometry = sankeyGeometry(readSankeyGraph(ctx.db), conf);
  const ribbons: Ribbon[] = geometry.ribbons.map((ribbon) => ({
    name: ribbon.name,
    colour: withOpacity(ribbonColour(conf, ribbon.source, ribbon.target), RIBBON_OPACITY),
    box: ribbon.box,
  }));
  const backing = conf.labelStyle === "outlined" ? ctx.vars.mainBkg || ctx.vars.background || "#fff" : ctx.page;
  const paint = { glyph: ctx.vars.textColor, backing, page: ctx.page };

  for (const [id, box] of geometry.labels) {
    measureLabel(
      id,
      ribbons.filter((ribbon) => overlaps(ribbon.box, box)),
      paint,
      add,
    );
  }
}
