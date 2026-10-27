import type { ThresholdConfig } from "../../complexity/metrics.ts";
import type { DiagramGraph } from "../../parsing/graph.ts";
import { buildWorkGraph, type WNode, type WorkGraph } from "../graph/model.ts";
import { byNatural, sorted } from "../graph/order.ts";
import { type LabelContext, labelStubs, type StubText } from "../labels/context.ts";
import {
  type Build,
  type Folded,
  type Group,
  keyOf,
  over,
  type Partition,
  type RowDetail,
  type SplitDetail,
  type SplitDetailFn,
  type SplitGroup,
} from "../planning/state.ts";
import { type DetailView, detailShape, detailView } from "../projection/detail.ts";
import { meets, scoreOf } from "../projection/quotient.ts";
import { boxedShape, boxesOf, detailGraph, graphNode } from "./graphs.ts";
import { emitSource } from "./serialize.ts";

interface DetailBuilt {
  detail: SplitDetail;
  nested: Build | null;
}

interface Assembly {
  folded: Folded;
  config: ThresholdConfig;
  split: SplitDetailFn;
  labels: LabelContext;

  // The keys of the groups whose details are split again (exactSide).
  nested: ReadonlySet<string>;
}

// A detail's view and its stubs' texts, a whole-group stub that reads alike
// another named by the member its edges leave where it can be (namedStubs).
// A stub's sources are every member of its group with an edge into this one,
// including those whose edges it draws once for several.
const viewOf = (a: Assembly, group: Group): { view: DetailView; texts: Map<string, StubText> } => {
  const { work, part } = a.folded;
  const view = detailView(work, part, group, {
    nested: a.nested,
    config: a.config,
  });
  const endOf = new Map(view.stubs.map((s) => [s.id, s.endpoint]));
  const here = keyOf(group);
  const sourcesOf = (stub: string): string[] => {
    const end = endOf.get(stub);

    return sorted(
      new Set(
        work.edges.filter((e) => over(part, e.source) === end && over(part, e.target) === here).map((e) => e.source),
      ),
    );
  };

  return {
    view,
    texts: labelStubs(a.labels, view.stubs, sourcesOf),
  };
};

// A detail draws its members' rows when it still meets the target with them.
export const buildDetail = (a: Assembly, g: SplitGroup): DetailBuilt | string => {
  const { work, part } = a.folded;
  const group = part.groups[part.groupOf.get(g.members[0] ?? "") ?? -1] as Group;
  const { view, texts } = viewOf(a, group);
  const plain = detailShape(work, view);
  const boxes = meets(plain.nodes, scoreOf(plain, 0, a.config), a.config) ? boxesOf(a, view, texts) : [];
  const shape = boxedShape(work, view, boxes);
  const rowsHere = rowCount(work, view.members);
  const rows = rowsHere > 0 && meets(shape.nodes, scoreOf(shape, rowsHere, a.config), a.config);
  const score = scoreOf(shape, rows ? rowsHere : 0, a.config);
  const graph = detailGraph(work, view, { texts, rows, boxes });
  const stubs = Object.fromEntries([
    ...view.stubs.map((s) => [s.id, texts.get(s.id)?.endpoint ?? s.endpoint]),
    ...boxes.map((b) => [b.id, b.endpoint]),
  ]);
  const source = emitSource(work, {
    graph,
    stubs: new Set(Object.keys(stubs)),
  });
  const detail = {
    group: g.id,
    graph,
    stubs,
    rows,
    source,
    nodes: shape.nodes,
    score,
    split: null,
  };

  if (meets(shape.nodes, score, a.config)) {
    return { detail, nested: null };
  }

  const measured = {
    nodes: shape.nodes,
    edges: shape.edges,
    subgraphs: shape.subgraphs,
    depth: shape.depth,
  };
  const nested = a.split(
    buildWorkGraph(graph, {
      direction: work.direction,
      rows: 0,
      stubs: Object.keys(stubs),
      measured,
    }),
  );

  if (typeof nested === "string") {
    return `the detail of ${g.label} exceeds the target and does not split: ${nested}`;
  }

  return { detail: { ...detail, split: nested.plan }, nested };
};

export const rowCount = (work: WorkGraph, ids: readonly string[]): number =>
  ids.reduce((sum, id) => sum + (work.nodes.get(id)?.rows?.length ?? 0), 0);

// Pack kept nodes' rows in natural ID order. Rows that cannot fit even alone
// remain declared as dropped rather than producing an oversized diagram.
export const rowDetailsOf = (work: WorkGraph, part: Partition, config: ThresholdConfig): RowDetail[] => {
  const kept = work.ids.filter((id) => !part.groupOf.has(id) && work.nodes.get(id)?.rows?.length).sort(byNatural);
  const fits = (ids: string[]): boolean =>
    meets(
      ids.length,
      scoreOf({ nodes: ids.length, edges: 0, subgraphs: 0, depth: 0 }, rowCount(work, ids), config),
      config,
    );
  const chunks: string[][] = [];

  for (const id of kept) {
    const last = chunks.at(-1);

    if (last && fits([...last, id])) {
      last.push(id);
    } else if (fits([id])) {
      chunks.push([id]);
    }
  }

  return chunks.map((members) => {
    const graph: DiagramGraph = {
      diagram_type: work.type,
      nodes: members.map((id) => graphNode(work.nodes.get(id) as WNode, null, true)),
      edges: [],
      subgraphs: [],
    };
    const shape = { nodes: members.length, edges: 0, subgraphs: 0, depth: 0 };
    const source = emitSource(work, { graph, stubs: new Set() });

    return {
      members,
      graph,
      source,
      nodes: members.length,
      score: scoreOf(shape, rowCount(work, members), config),
    };
  });
};
