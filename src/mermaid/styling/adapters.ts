import type { DiagramStyleClassDef } from "mermaid/dist/diagram-api/types.js";
import type { ErDB } from "mermaid/dist/diagrams/er/erDb.js";
import type { FlowDB } from "mermaid/dist/diagrams/flowchart/flowDb.js";
import type { StateDB } from "mermaid/dist/diagrams/state/stateDb.js";
import type { Db, DirectiveKind, Hook, Method, Reader, Styled } from "./types.ts";

// Family-specific grammar hooks and resolved declaration cascades.

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : []);

function arrayStatement(kind: DirectiveKind): Hook {
  return ([ids, styles]) => ({
    kind,
    ids: strings(ids),
    styles: strings(styles),
  });
}

type ClassMap = Map<string, DiagramStyleClassDef>;

const call = <T>(db: Db, name: string, ...args: unknown[]): T => {
  const method = db[name];

  if (typeof method !== "function") {
    throw new Error(`the parser's DB has no ${name}`);
  }

  return (method as Method).apply(db, args) as T;
};

const classDefs = (classes: ClassMap): Styled[] =>
  [...classes].map(([id, c]) => ({
    kind: "classDef",
    selector: id,
    inherited: [],
    own: strings(c.styles),
  }));

// A flowchart's edges, with the default linkStyle mermaid keeps on the array.
const flowchart: Reader = {
  hooks: {
    // mermaid splits a classDef's id list on commas, so it is read the same way.
    addClass: ([ids, styles]) => ({
      kind: "classDef",
      ids: String(ids).split(","),
      styles: strings(styles),
    }),

    // A vertex statement passes no styles. Only a style statement does.
    addVertex: ([id, , , styles]) =>
      Array.isArray(styles) ? { kind: "style", ids: [String(id)], styles: strings(styles) } : null,
    updateLink: arrayStatement("linkStyle"),
  },
  styled: (db) => {
    const out = classDefs(call<ClassMap>(db, "getClasses"));
    const vertices = call<ReturnType<FlowDB["getVertices"]>>(db, "getVertices");

    for (const [id, v] of vertices) {
      const own = strings(v.styles);

      if (own.length === 0) {
        continue;
      }

      // The renderer compiles the default and node classes, then the vertex's.
      const inherited = call<string[]>(db, "getCompiledStyles", ["default", "node", ...strings(v.classes)]);

      out.push({ kind: "style", selector: id, inherited, own });
    }

    const edges = call<ReturnType<FlowDB["getEdges"]>>(db, "getEdges");
    const fallback = strings(edges.defaultStyle);

    if (fallback.length > 0) {
      out.push({
        kind: "linkStyle",
        selector: "default",
        inherited: [],
        own: fallback,
      });
    }

    for (const [i, e] of edges.entries()) {
      const own = strings(e.style);

      if (own.length > 0) {
        out.push({
          kind: "linkStyle",
          selector: String(i),
          inherited: fallback,
          own,
        });
      }
    }

    return out;
  },
};

const er: Reader = {
  hooks: {
    addClass: arrayStatement("classDef"),
    addCssStyles: arrayStatement("style"),
  },
  styled: (db) => {
    const out = classDefs(call<ClassMap>(db, "getClasses"));
    const entities = call<ReturnType<ErDB["getEntities"]>>(db, "getEntities");

    for (const [name, e] of entities) {
      const own = strings(e.cssStyles);

      if (own.length === 0) {
        continue;
      }

      // An entity's classes are one space-separated list, as the renderer reads them.
      const inherited = call<string[]>(db, "getCompiledStyles", String(e.cssClasses ?? "").split(" "));

      out.push({ kind: "style", selector: name, inherited, own });
    }

    return out;
  },
};

// The statement a stateDiagram's grammar hands its DB: the ids token's text
// and the styles token's text, each trimmed.
interface StateItem {
  id?: unknown;
  styleClass?: unknown;
}

// A state diagram records its statements during the parse and applies them
// after it, through handleStyleDef for a style statement and addStyleClass
// for a classDef. What each one styles is read from the DB once it has run,
// and its keyword is the one whose tokens hold the text the grammar passed.
const state: Reader = {
  hooks: {
    handleStyleDef: ([item], db, apply) => {
      const { id, styleClass } = (item ?? {}) as StateItem;

      apply();

      const ids = String(id).trim().split(",");
      const styled = call<ReturnType<StateDB["getState"]>>(db, "getState", ids[0]?.trim());

      return {
        kind: "style",
        ids: ids.map((s) => s.trim()),
        styles: strings(styled?.styles),
        lexed: [String(id).trim(), String(styleClass).trim()],
      };
    },
    addStyleClass: ([id, attributes], db, apply) => {
      const classes = call<ClassMap>(db, "getClasses");
      const before = strings(classes.get(String(id))?.styles).length;

      apply();

      return {
        kind: "classDef",
        ids: [String(id)],
        styles: strings(classes.get(String(id))?.styles).slice(before),
        lexed: [String(id), String(attributes ?? "").trim()],
      };
    },
  },
  styled: (db) => {
    const classes = call<ClassMap>(db, "getClasses");
    const out = classDefs(classes);
    const states = call<ReturnType<StateDB["getStates"]>>(db, "getStates");

    for (const [id, s] of states) {
      const own = strings(s.styles);

      if (own.length === 0) {
        continue;
      }

      const inherited = strings(s.classes).flatMap((c) => strings(classes.get(c)?.styles));

      out.push({ kind: "style", selector: id, inherited, own });
    }

    return out;
  },
};

// A classDiagram keeps its classDefs apart from its classes, and copies a
// classDef's styles into every class that carries it, so a class's styles are
// already what the renderer applies. Only a class a style statement styles is
// a style directive. Its lexer reads a statement's declarations as LABEL
// tokens that run across the commas between them.
const classDiagram: Reader = {
  hooks: {
    defineClass: arrayStatement("classDef"),
    setCssStyle: ([id, styles]) => ({
      kind: "style",
      ids: [String(id)],
      styles: strings(styles),
    }),
  },
  styled: (db, statements) => {
    const defs = db.styleClasses;
    const out = defs instanceof Map ? classDefs(defs as ClassMap) : [];
    const styledIds = new Set(statements.filter((s) => s.kind === "style").flatMap((s) => s.ids));

    for (const [id, c] of call<ClassMap>(db, "getClasses")) {
      if (styledIds.has(id)) {
        out.push({
          kind: "style",
          selector: id,
          inherited: [],
          own: strings(c.styles),
        });
      }
    }

    return out;
  },
};

// The reader for each mermaid diagram type.
export const READERS: Readonly<Record<string, Reader>> = {
  flowchart,
  "flowchart-v2": flowchart,
  "flowchart-elk": flowchart,
  swimlane: flowchart,
  er,
  state,
  stateDiagram: state,
  class: classDiagram,
  classDiagram,
};
