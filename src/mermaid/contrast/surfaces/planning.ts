import type { GitGraphDB } from "mermaid/dist/diagrams/git/gitGraphTypes.js";
import { compositeOver, withOpacity } from "../colors.ts";
import type { AddSurface, SurfaceContext, ThemeVariables } from "../theme.ts";

type GanttDB = typeof import("mermaid/dist/diagrams/gantt/ganttDb.js").default;
type KanbanDB =
  typeof import("mermaid/dist/diagrams/kanban/kanbanDb.js").default;
type JourneyDB =
  typeof import("mermaid/dist/diagrams/user-journey/journeyDb.js").default;
type TimelineDB =
  typeof import("mermaid/dist/diagrams/timeline/timelineDb.js").default;
type WardleyDB =
  typeof import("mermaid/dist/diagrams/wardley/wardleyDb.js").default;

export function ganttSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, page } = ctx;
  const db = ctx.db as GanttDB;

  const sections = db.getSections();
  const backgrounds = sections.map((section, i) => {
    const fill =
      i % 4 === 0
        ? v.sectionBkgColor
        : i % 4 === 2
          ? v.sectionBkgColor2
          : v.altSectionBkgColor;
    const bg = compositeOver(withOpacity(fill, 0.2), page);
    add(`section ${section}`, v.titleColor, bg);
    return bg;
  });
  add("axis labels", v.textColor);
  for (const task of db.getTasks()) {
    const bg = backgrounds[Math.max(0, sections.indexOf(task.section))] ?? page;
    const fill = ganttFill(task, v);
    const text =
      task.crit || task.done || task.active
        ? v.taskTextDarkColor
        : v.taskTextColor;
    add(`task ${task.task} inside bar`, text, compositeOver(fill, bg));
    // Labels move outside short bars when the chart width changes. Both
    // reachable placements must remain readable for responsive diagrams.
    add(`task ${task.task} outside bar`, v.taskTextOutsideColor, bg);
  }
}

export function gitGraphSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, config } = ctx;
  const db = ctx.db as GitGraphDB;

  if (config.gitGraph?.showBranches !== false)
    for (const [i, branch] of db.getBranchesAsObjArray().entries())
      add(
        `branch ${branch.name}`,
        v[`gitBranchLabel${i % 8}`],
        v[`git${i % 8}`],
      );
  for (const commit of db.getCommitsArray()) {
    if (config.gitGraph?.showCommitLabel !== false)
      add(
        `commit ${commit.id}`,
        v.commitLabelColor,
        withOpacity(v.commitLabelBackground, 0.5),
      );
    for (const tag of commit.tags ?? [])
      add(`tag ${tag}`, v.tagLabelColor, v.tagLabelBackground);
  }
}

export function kanbanSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, page } = ctx;
  const db = ctx.db as KanbanDB;

  for (const node of db.getData().nodes)
    add(node.label ?? node.id, v.textColor, node.isGroup ? page : v.background);
}

export function journeySurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, config } = ctx;
  const db = ctx.db as JourneyDB;

  const sections = db.getSections();
  const settings = { ...db.getConfig(), ...config.journey };
  const textAt = (i: number) =>
    settings.textPlacement === "fo"
      ? v.textColor
      : (settings.sectionColours ?? ["#fff"])[
          i % (settings.sectionColours?.length ?? 1)
        ];
  for (const [i, section] of sections.entries())
    add(section, textAt(i), v[`fillType${i % 8}`]);
  for (const task of db.getTasks()) {
    const i = Math.max(0, sections.indexOf(task.section));
    add(task.task, textAt(i), v[`fillType${i % 8}`]);
  }
  for (const actor of db.getActors()) add(`actor ${actor}`, v.textColor);
}

export function timelineSurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v } = ctx;
  const db = ctx.db as TimelineDB;

  const sections = db.getSections();
  for (const [i, section] of sections.entries())
    add(section, v[`cScaleLabel${i + 1}`], v[`cScale${i + 1}`]);
  for (const task of db.getTasks()) {
    const index = Math.max(0, sections.indexOf(task.section)) + 1;
    add(task.task, v[`cScaleLabel${index}`], v[`cScale${index}`]);
    for (const event of task.events ?? [])
      add(event, v[`cScaleLabel${index}`], v[`cScale${index}`]);
  }
}

export function wardleySurfaces(ctx: SurfaceContext, add: AddSurface): void {
  const { vars: v, defaults } = ctx;
  const db = ctx.db as WardleyDB;

  const options = { ...defaults.wardley, ...v.wardley };
  const data = db.getWardleyData();
  const background = options.backgroundColor;
  add("axes and stages", options.axisTextColor, background);
  for (const node of data.nodes)
    add(node.label, options.componentLabelColor, background);
  for (const note of data.notes)
    add(`note ${note.text ?? note}`, options.axisTextColor, background);
  for (const annotation of data.annotations)
    add(
      `annotation ${annotation.text ?? annotation}`,
      options.annotationTextColor,
      options.annotationFill,
    );
  for (const link of data.links)
    if (link.label) add(link.label, options.axisTextColor, background);
}

function ganttFill(
  task: ReturnType<GanttDB["getTasks"]>[number],
  v: ThemeVariables,
): string {
  if (task.done) return v.doneTaskBkgColor;
  if (task.active) return v.activeTaskBkgColor;
  return task.crit ? v.critBkgColor : v.taskBkgColor;
}
