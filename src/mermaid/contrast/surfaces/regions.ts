import { darken, isDark, lighten } from "khroma";
import type { CynefinDB, DomainName } from "mermaid/dist/diagrams/cynefin/types.js";
import type { VennDB } from "mermaid/dist/diagrams/venn/vennTypes.js";
import { compositeOver, withOpacity } from "../colors.ts";
import type { AddSurface, SurfaceContext, ThemeVariables } from "../theme.ts";

export function vennSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const db = ctx.db as VennDB;
  const sets = db.getCurrentSets() ?? [];

  if (db.getStyleData().length) {
    throw new Error("Venn style statements are not modeled");
  }

  for (const region of db.getSubsetData()) {
    const key = [...region.sets].sort().join("|");
    const background = region.sets.reduce(
      (backing, id) => compositeOver(withOpacity(vennFill(id, sets, ctx), 0.1), backing),
      ctx.page,
    );

    add(`region ${key}`, vennText(region.sets, sets, ctx), background);
  }

  for (const text of db.getTextData()) {
    if (text.sets.length) {
      throw new Error("Venn positioned text overlap is not modeled");
    }

    add(text.label ?? text.id, ctx.vars.vennSetTextColor);
  }
}

function vennText(region: string[], sets: string[], ctx: SurfaceContext): string {
  if (region.length !== 1) {
    return ctx.vars.vennSetTextColor ?? ctx.vars.primaryTextColor;
  }

  const fill = vennFill(region[0] ?? "", sets, ctx);

  // Mermaid 11.17.2 derives circle labels with Khroma; intersection labels
  // instead use vennSetTextColor. Reuse its color operations exactly.
  return isDark(ctx.vars.background || "#f4f4f4") ? lighten(fill, 30) : darken(fill, 30);
}

const vennFill = (id: string, sets: string[], ctx: SurfaceContext): string =>
  ctx.vars[`venn${(sets.indexOf(id) % 8) + 1}`] || ctx.vars.primaryColor;

export function cynefinSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const db = ctx.db as CynefinDB;

  for (const name of CYNEFIN_DOMAINS) {
    cynefinDomain(ctx, db, name, add);
  }

  const options = { ...ctx.defaults.cynefin, ...ctx.vars.cynefin };
  const backgrounds = cynefinQuadrants(ctx, options);

  for (const transition of db.getTransitions()) {
    if (!transition.label || transition.from === transition.to) {
      continue;
    }

    for (const background of backgrounds) {
      add(transition.label, options.textColor, background);
    }
  }
}

const CYNEFIN_DOMAINS: DomainName[] = ["complex", "complicated", "chaotic", "clear", "confusion"];

function cynefinQuadrants(ctx: SurfaceContext, options: ThemeVariables): string[] {
  return CYNEFIN_DOMAINS.slice(0, 4).map((name) => compositeOver(withOpacity(options[`${name}Bg`], 0.4), ctx.page));
}

function cynefinDomain(ctx: SurfaceContext, db: CynefinDB, name: DomainName, add: AddSurface): void {
  const options = { ...ctx.defaults.cynefin, ...ctx.vars.cynefin };
  const quadrants = cynefinQuadrants(ctx, options);
  const backgrounds =
    name === "confusion"
      ? quadrants.map((bg) => compositeOver(withOpacity(options.confusionBg, 0.5), bg))
      : [quadrants[CYNEFIN_DOMAINS.indexOf(name)]];
  const items = db.getDomains().get(name)?.items ?? [];

  for (const background of backgrounds) {
    paintCynefinLayer({ ctx, name, options, items, background }, add);
  }
}

interface CynefinLayer {
  ctx: SurfaceContext;
  name: DomainName;
  options: ThemeVariables;
  items: { label: string }[];
  background: string;
}

function paintCynefinLayer({ ctx, name, options, items, background }: CynefinLayer, add: AddSurface): void {
  add(`${name} domain`, options.labelColor, background);

  if (ctx.config.cynefin?.showDomainDescriptions !== false) {
    add(`${name} description`, options.textColor, background);
  }

  const visible = name === "confusion" ? items.slice(0, 3) : items;

  for (const item of visible) {
    add(item.label, options.textColor, compositeOver(withOpacity(options[`${name}Bg`], 0.95), background));
  }

  if (name === "confusion" && items.length > 3) {
    add("confusion overflow", options.textColor, compositeOver(withOpacity(options.confusionBg, 0.6), background));
  }
}
