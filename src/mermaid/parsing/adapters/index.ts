import type { AnyDb, Structure } from "../model.ts";
import {
  adaptC4,
  adaptCynefin,
  adaptGantt,
  adaptJourney,
  adaptKanban,
  adaptQuadrantChart,
  adaptRequirement,
  adaptSankey,
  adaptTimeline,
  adaptVenn,
  adaptXychart,
} from "./collections.ts";
import { adaptClass, adaptEr, adaptFlowchart, adaptState } from "./graphs.ts";
import { adaptSequence } from "./sequence.ts";
import { adaptBlock, adaptIshikawa, adaptMindmap, adaptRailroad } from "./trees.ts";

type CoreAdapter = (db: AnyDb) => Structure;

const CORE_ADAPTERS: Record<string, CoreAdapter> = {
  "flowchart-v2": adaptFlowchart,
  flowchart: adaptFlowchart,

  // `flowchart-elk` is a flowchart drawn with the ELK layout. Mermaid parses it
  // with the flowchart grammar into the same DB, and only the layout differs.
  "flowchart-elk": adaptFlowchart,
  graph: adaptFlowchart,
  swimlane: adaptFlowchart,
  classDiagram: adaptClass,
  "classDiagram-v2": adaptClass,
  class: adaptClass,
  sequence: adaptSequence,
  block: adaptBlock,
  c4: adaptC4,
  er: adaptEr,
  gantt: adaptGantt,
  ishikawa: adaptIshikawa,
  kanban: adaptKanban,
  mindmap: adaptMindmap,
  quadrantChart: adaptQuadrantChart,
  requirement: adaptRequirement,
  sankey: adaptSankey,
  stateDiagram: adaptState,
  "stateDiagram-v2": adaptState,
  timeline: adaptTimeline,
  journey: adaptJourney,
  venn: adaptVenn,
  xychart: adaptXychart,
  railroad: adaptRailroad,
  railroadEbnf: adaptRailroad,
  railroadAbnf: adaptRailroad,
  railroadPeg: adaptRailroad,
  cynefin: adaptCynefin,
};

// Eventmodeling's DB getState() performs SVG text measurement. Read its official
// Langium AST instead and reproduce the renderer's structural decisions only.

export function readCoreStructure(type: string, db: unknown): Structure {
  const adapter = CORE_ADAPTERS[type];

  if (!adapter) {
    throw new Error(`no core adapter for diagram.type="${type}"`);
  }

  return adapter(db as AnyDb);
}
