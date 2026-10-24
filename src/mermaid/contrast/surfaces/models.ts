import { parse as mermaidParse } from "@mermaid-js/parser";
import type { ArchitectureDB } from "mermaid/dist/diagrams/architecture/architectureDb.js";
import type { PacketDB } from "mermaid/dist/diagrams/packet/db.js";
import type { RequirementDB } from "mermaid/dist/diagrams/requirement/requirementDb.js";
import { compositeOver } from "../colors.ts";
import type { AddSurface, SurfaceContext } from "../theme.ts";

type BlockDB = typeof import("mermaid/dist/diagrams/block/blockDB.js").default;
type C4DB = typeof import("mermaid/dist/diagrams/c4/c4Db.js").default;

export function packetSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v } = ctx;
  const db = ctx.db as PacketDB;

  const options = {
    startByteColor: "black",
    endByteColor: "black",
    labelColor: "black",
    blockFillColor: "#efefef",
    ...v.packet,
  };
  for (const block of db.getPacket().flat()) {
    add(block.label, options.labelColor, options.blockFillColor);
    add(`start byte ${block.start}`, options.startByteColor);
    add(`end byte ${block.end}`, options.endByteColor);
  }
}

export function requirementSurfaces(
  ctx: SurfaceContext,
  add: AddSurface,
): void {
  const { vars: v } = ctx;
  const db = ctx.db as RequirementDB;

  for (const item of [
    ...db.getRequirements().values(),
    ...db.getElements().values(),
  ]) {
    if (item.cssStyles?.length || item.classes?.some((c) => c !== "default"))
      throw new Error("requirement custom styles are not modeled");
    add(item.name, v.requirementTextColor, v.requirementBackground);
  }
  if (db.getRelationships().length)
    add("relationship labels", v.relationLabelColor, v.relationLabelBackground);
}

export function blockSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v } = ctx;
  const db = ctx.db as BlockDB;

  for (const block of db.getBlocksFlat()) {
    if (!visibleBlock(block)) continue;
    rejectBlockStyles(block);
    add(
      block.label ?? block.id,
      v.nodeTextColor ?? v.textColor,
      block.children?.length ? v.clusterBkg : v.mainBkg,
    );
  }
  if (db.getEdges().some((e) => e.label))
    add("edge labels", v.textColor, v.edgeLabelBackground);
}

export function architectureSurfaces(
  ctx: SurfaceContext,
  add: AddSurface,
): void {
  const { vars: v } = ctx;
  const db = ctx.db as ArchitectureDB;

  for (const item of [...db.getServices(), ...db.getGroups()]) {
    if (item.title) add(item.title, v.textColor);
    // Unknown named icons are replaced by their name in a blue square by
    // Mermaid. Built-in server/database/disk/internet/cloud icons contain
    // vector geometry, not label text.
    if (
      item.icon &&
      !["server", "database", "disk", "internet", "cloud"].includes(
        item.icon,
      ) &&
      !item.icon.includes(":")
    )
      add(`icon ${item.icon}`, "#fff", "#087ebf");
  }
  for (const edge of db.getEdges())
    if (edge.title) add(edge.title, v.textColor);
}

export function c4Surfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { config, page } = ctx;
  const db = ctx.db as C4DB;

  const settings = { ...db.getConfig(), ...config.c4 };
  const boundaries = db.getBoundaries();
  const backgroundOf = (id: string, seen = new Set<string>()): string => {
    if (!id || id === "global") return page;
    if (seen.has(id)) throw new Error("cyclic C4 boundary containment");
    seen.add(id);
    const boundary = boundaries.find((b) => b.alias === id);
    return boundary
      ? compositeOver(
          boundary.bgColor ?? "transparent",
          backgroundOf(boundary.parentBoundary, seen),
        )
      : page;
  };
  for (const boundary of boundaries.filter((b) => b.alias !== "global"))
    add(
      boundary.alias,
      boundary.fontColor ?? "black",
      backgroundOf(boundary.alias),
    );
  for (const shape of db.getC4ShapeArray())
    add(
      shape.alias,
      shape.fontColor ?? "#fff",
      compositeOver(
        shape.bgColor ??
          (settings[
            `${shape.typeC4Shape.text}_bg_color` as keyof typeof settings
          ] as string),
        backgroundOf(shape.parentBoundary),
      ),
    );
  for (const rel of db.getRels())
    add(`relationship ${rel.label.text}`, rel.textColor ?? "#444444");
  if (db.getTitle()) add("C4 title", "black");
}

export async function eventmodelingSurfaces(
  ctx: SurfaceContext,
  add: AddSurface,
): Promise<void> {
  const { vars: v, source, page } = ctx;

  const ast = await mermaidParse("eventmodeling", source);
  const fillKeys = {
    ui: "emUiFill",
    pcr: "emProcessorFill",
    processor: "emProcessorFill",
    cmd: "emCommandFill",
    command: "emCommandFill",
    rmo: "emReadModelFill",
    readmodel: "emReadModelFill",
    evt: "emEventFill",
    event: "emEventFill",
  };
  const lanes = new Set();
  const laneFill = v.emSwimlaneBackgroundOdd ?? "rgb(250,250,250)";
  for (const frame of ast.frames) {
    if (!frame.entityIdentifier) continue;
    const lane = `${frame.modelEntityType}:${frame.entityIdentifier.split(".")[0]}`;
    lanes.add(lane);
    const fill = v[fillKeys[frame.modelEntityType]];
    if (!fill)
      throw new Error(
        `eventmodeling entity type ${frame.modelEntityType} is not modeled`,
      );
    add(
      frame.entityIdentifier,
      v.textColor,
      compositeOver(fill, compositeOver(laneFill, page)),
    );
  }
  for (const lane of lanes) add(`swimlane ${lane}`, v.textColor, laneFill);
}

type Block = ReturnType<BlockDB["getBlocksFlat"]>[number];

function visibleBlock(block: Block): boolean {
  return block.id !== "root" && block.type !== "space";
}

function rejectBlockStyles(block: Block): void {
  if (block.styles?.length || block.classes?.length)
    throw new Error("block custom styles are not modeled");
}
