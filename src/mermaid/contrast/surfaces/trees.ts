import type { IshikawaDB } from "mermaid/dist/diagrams/ishikawa/ishikawaDb.js";
import type { MindmapDB } from "mermaid/dist/diagrams/mindmap/mindmapDb.js";
import type {
  ASTNode,
  RailroadDB,
} from "mermaid/dist/diagrams/railroad/railroadTypes.js";
import type { TreeMapDB } from "mermaid/dist/diagrams/treemap/db.js";
import type { TreemapNode } from "mermaid/dist/diagrams/treemap/types.js";
import type { TreeViewDB } from "mermaid/dist/diagrams/treeView/types.js";
import { walkTree } from "../../parsing/model.ts";
import { propertiesOf } from "../../styling/properties.ts";
import { compositeOver } from "../colors.ts";
import type { AddSurface, SurfaceContext } from "../theme.ts";

export function mindmapSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v } = ctx;
  const db = ctx.db as MindmapDB;

  const root = db.getMindmap();
  if (!root) return;
  add(root.descr, v.gitBranchLabel0, v.git0);
  for (const [index, branch] of root.children.entries())
    for (const { node } of walkTree(branch)) {
      const i = (index % 11) + 1;
      const disabled = node.class?.split?.(/\s+/).includes("disabled");
      add(
        node.descr,
        disabled ? "#efefef" : v[`cScaleLabel${i}`],
        disabled ? "lightgray" : v[`cScale${i}`],
      );
    }
}

export function treemapSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const db = ctx.db as TreeMapDB;
  for (const node of db.getRoot().children)
    paintTreemap(node, ctx, add, ctx.page);
}

export function treeViewSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, page } = ctx;
  const db = ctx.db as TreeViewDB;

  const options = {
    labelColor: "black",
    descriptionColor: "#6a9955",
    highlightBg: "rgba(255,193,7,0.15)",
    ...v.treeView,
  };
  for (const { node } of walkTree(db.getRoot())) {
    const background = node.cssClass?.split(/\s+/).includes("highlight")
      ? options.highlightBg
      : page;
    add(node.name, options.labelColor, background);
    if (node.description)
      add(`${node.name} description`, options.descriptionColor, background);
  }
}

export function ishikawaSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, page } = ctx;
  const db = ctx.db as IshikawaDB;

  for (const { node, depth } of walkTree(db.getRoot()))
    add(node.text, v.textColor, depth < 2 ? v.mainBkg : page);
}

function treemapProperties(node: TreemapNode): Record<string, string> {
  const own = propertiesOf(node.cssCompiledStyles ?? []);
  const allowed = new Set([
    "fill",
    "color",
    "stroke",
    "stroke-width",
    "stroke-dasharray",
    "font-size",
    "font-weight",
  ]);
  if (Object.keys(own).some((key) => !allowed.has(key)))
    throw new Error("treemap style modifier is not modeled");
  return own;
}

function paintTreemap(
  node: TreemapNode,
  ctx: SurfaceContext,
  add: AddSurface,
  parent: string,
): void {
  const options = {
    sectionFillColor: "#efefef",
    leafFillColor: "#efefef",
    labelColor: ctx.vars.textColor,
    valueColor: ctx.vars.textColor,
    ...ctx.vars.treemap,
  };
  const own = treemapProperties(node);
  const fill =
    own.fill ??
    (node.children?.length ? options.sectionFillColor : options.leafFillColor);
  const background = compositeOver(fill, parent);
  add(node.name, own.color ?? options.labelColor, background);
  if (node.value !== undefined && ctx.vars.treemap?.showValues !== false)
    add(`${node.name} value`, own.color ?? options.valueColor, background);
  for (const child of node.children ?? [])
    paintTreemap(child, ctx, add, background);
}

export function railroadSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, config } = ctx;
  const db = ctx.db as RailroadDB;

  const options = {
    terminalFill: v.secondBkg ?? v.secondaryColor,
    terminalTextColor: v.secondaryTextColor ?? v.textColor,
    nonTerminalFill: v.mainBkg ?? v.background,
    nonTerminalTextColor: v.primaryTextColor ?? v.textColor,
    commentFill: v.labelBackground ?? v.tertiaryColor,
    commentTextColor: v.tertiaryTextColor ?? v.textColor,
    specialFill: v.tertiaryColor ?? v.secondaryColor,
    ruleNameColor: v.titleColor ?? v.textColor,
    ...config.railroad,
  };
  for (const rule of db.getRules()) {
    add(`rule ${rule.name}`, options.ruleNameColor);
    visitRailroad(rule.definition, options, add);
  }
}

type RailroadPalette = Required<
  Pick<
    import("mermaid/dist/diagrams/railroad/railroadTypes.js").RailroadStyleOptions,
    | "terminalFill"
    | "terminalTextColor"
    | "nonTerminalFill"
    | "nonTerminalTextColor"
    | "specialFill"
  >
>;

function railroadChildren(node: ASTNode): ASTNode[] {
  if ("elements" in node) return node.elements;
  if ("alternatives" in node) return node.alternatives;
  const out = "element" in node ? [node.element] : [];
  if ("separator" in node && node.separator) out.push(node.separator);
  return out;
}

function visitRailroad(
  node: ASTNode,
  colors: RailroadPalette,
  add: AddSurface,
): void {
  if (node.type === "terminal")
    add(node.value, colors.terminalTextColor, colors.terminalFill);
  if (node.type === "nonterminal")
    add(node.name, colors.nonTerminalTextColor, colors.nonTerminalFill);
  if (node.type === "special")
    add(node.text, colors.nonTerminalTextColor, colors.specialFill);
  for (const child of railroadChildren(node)) visitRailroad(child, colors, add);
}
