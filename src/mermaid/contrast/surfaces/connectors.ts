import { list, listGetter } from "../../compat/shapes.ts";
import type { MindmapDB, TreeViewDB } from "../../compat/types.ts";
import { alphaOf } from "../colors.ts";
import type { Connectors } from "../rendered.ts";
import type { SurfaceContext, TextSurface, ThemeVariables } from "../theme.ts";

// Connectors of the families whose renderers draw lines from theme paint,
// measured against Mermaid 11.17.2 in a browser. Each returns one surface per
// distinct paint; a line and its arrowhead are separate when they can differ.
// Guides, borders and invisible layout links are not Connectors.

type FamilyConnectors = (ctx: SurfaceContext) => Connectors | Promise<Connectors>;

const surface = (name: string, foreground: string | undefined, background: string): TextSurface => {
  if (typeof foreground !== "string") {
    throw new Error(`${name} has no resolved stroke colour`);
  }

  return { name, foreground, background };
};

const only = (surfaces: TextSurface[]): Connectors => ({ surfaces, unsupported: [] });

const colour = (value: unknown): value is string => {
  if (typeof value !== "string") {
    return false;
  }

  try {
    alphaOf(value);

    return true;
  } catch {
    return false;
  }
};

// .edge { stroke: archEdgeColor } and .arrow { fill: archEdgeArrowColor }; groups are unfilled.
const architecture: FamilyConnectors = (ctx) => {
  const edges = listGetter<{ lhsInto?: boolean; rhsInto?: boolean }>(ctx.db, "getEdges");

  return only([
    ...(edges.length ? [surface("architecture edge line", ctx.vars.archEdgeColor, ctx.page)] : []),
    ...(edges.some((edge) => edge.lhsInto || edge.rhsInto)
      ? [surface("architecture edge arrowhead", ctx.vars.archEdgeArrowColor, ctx.page)]
      : []),
  ]);
};

// .relationshipLine { stroke: relationColor }, and its markers share that colour.
const requirement: FamilyConnectors = (ctx) =>
  only(
    listGetter(ctx.db, "getRelationships").length
      ? [
          surface("requirement relation line", ctx.vars.relationColor, ctx.page),
          surface("requirement relation arrowhead", ctx.vars.relationColor, ctx.page),
        ]
      : [],
  );

// Each branch's edges take its section colour, .section-edge-N { stroke: cScale(N+1) }.
const mindmap: FamilyConnectors = (ctx) => {
  const root = (ctx.db as MindmapDB).getMindmap();
  const branches = root ? list<{ children?: unknown[] }>(root.children, "mindmap root children") : [];

  return only(
    branches.map((_, index) =>
      surface(`mindmap branch ${index + 1} edge`, ctx.vars[`cScale${(index % 11) + 1}`], ctx.page),
    ),
  );
};

// Relations cross the swimlanes, whose fill the renderer reads from the theme.
const eventmodeling: FamilyConnectors = (ctx) => {
  const frames = (ctx.source.match(/^\s*tf\s/gm) ?? []).length;

  if (frames < 2) {
    return only([]);
  }

  const lanes = ctx.vars.emSwimlaneBackgroundOdd ?? "rgb(250,250,250)";

  return only(
    [lanes, ctx.page].flatMap((background) => [
      surface("eventmodeling relation line", ctx.vars.emRelationStroke ?? "#000", background),
      surface("eventmodeling relation arrowhead", ctx.vars.emArrowhead ?? "#000000", background),
    ]),
  );
};

// .treeView-node-line { stroke: treeView.lineColor }, black unless configured.
const treeView: FamilyConnectors = (ctx) => {
  const root = (ctx.db as TreeViewDB).getRoot();
  const options = { lineColor: "black", ...(ctx.vars.treeView as ThemeVariables | undefined) };

  return only(root.children.length ? [surface("tree line", options.lineColor, ctx.page)] : []);
};

// A relation line is its own colour or #444444; its arrowhead has no fill of
// its own and inherits the diagram's text paint.
const c4: FamilyConnectors = (ctx) => {
  const rels = listGetter<{ from: string; to: string; lineColor?: string }>(ctx.db, "getRels");

  return only(
    rels.flatMap((rel) => [
      surface(`relation ${rel.from} → ${rel.to} line`, rel.lineColor ?? "#444444", ctx.page),
      surface(`relation ${rel.from} → ${rel.to} arrowhead`, ctx.vars.textColor, ctx.page),
    ]),
  );
};

// The baseline and event connectors are drawn black, then restyled by the last
// section rule, cScaleLabel(THEME_COLOR_LIMIT - 1). When that is not a colour
// the rule is invalid and the black attribute shows. The arrowhead inherits
// the diagram's text paint.
const timeline: FamilyConnectors = (ctx) => {
  const limit = Number(ctx.vars.THEME_COLOR_LIMIT ?? 12);
  const styled = ctx.vars[`cScaleLabel${limit - 1}`];

  return only([
    surface("timeline line", colour(styled) ? styled : "black", ctx.page),
    surface("timeline arrowhead", ctx.vars.textColor, ctx.page),
  ]);
};

// .railroad-line { stroke: lineColor }, the theme's line colour or black.
const railroad: FamilyConnectors = (ctx) => {
  const configured = (ctx.config as { railroad?: { lineColor?: unknown } }).railroad?.lineColor;
  const themed = colour(ctx.vars.lineColor) ? ctx.vars.lineColor : "#000000";

  return only([surface("railroad line", colour(configured) ? configured : themed, ctx.page)]);
};

// Spine, branches and sub-branches share .ishikawa-* { stroke: lineColor }.
const ishikawa: FamilyConnectors = (ctx) => only([surface("ishikawa line", ctx.vars.lineColor, ctx.page)]);

interface BlockItem {
  id?: string;
  type?: string;
  children?: BlockItem[];
}

// Block edges use the flowchart link paint. An edge inside a composite block
// crosses its translucent cluster fill, which is not modelled.
const block: FamilyConnectors = (ctx) => {
  const edges = listGetter<{ start?: string; end?: string }>(ctx.db, "getEdges");
  const nested = new Set<string>();
  const visit = (items: BlockItem[], inside: boolean) => {
    for (const item of items) {
      if (inside && item.id) {
        nested.add(item.id);
      }

      visit(item.children ?? [], inside || item.type === "composite");
    }
  };

  visit(listGetter<BlockItem>(ctx.db, "getBlocks"), false);

  if (edges.some((edge) => nested.has(edge.start ?? "") || nested.has(edge.end ?? ""))) {
    return {
      surfaces: [],
      unsupported: ["block edges inside composite blocks cross a cluster fill that is not modelled"],
    };
  }

  return only(
    edges.length
      ? [
          surface("block edge line", ctx.vars.lineColor, ctx.page),
          surface("block edge arrowhead", ctx.vars.lineColor, ctx.page),
        ]
      : [],
  );
};

export const FAMILY_CONNECTORS: Readonly<Record<string, FamilyConnectors>> = {
  architecture,
  requirement,
  mindmap,
  eventmodeling,
  treeView,
  c4,
  timeline,
  railroad,
  railroadEbnf: railroad,
  railroadAbnf: railroad,
  railroadPeg: railroad,
  ishikawa,
  block,
};
