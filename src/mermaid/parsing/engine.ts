import Color from "colorjs.io";
import { Window } from "happy-dom";

// A repair to the happy-dom window mermaid runs in. A browser's
// Node.prototype getters read each node's own name and text. happy-dom
// declares them on Node as empty and overrides them on each subclass, so a
// getter called through Node.prototype answers "" for every node. DOMPurify
// reads nodeName that way, saw every element unnamed and removed it, and so
// mermaid's sanitizer dropped a label's text before its first tag, all but
// the last line of a <br> label, and any label holding "<".

// The properties DOMPurify, or anything else, may read through Node.prototype.
const NODE_GETTERS = ["nodeName", "nodeValue", "textContent"] as const;

// Each getter, called on a node, runs the nearest override on the node's own
// class, as a browser's does, and Node's own getter only when none overrides it.
const dispatchToOverride = (proto: object, property: string): void => {
  const base = Object.getOwnPropertyDescriptor(proto, property);
  const baseGet = base?.get;
  if (!(base && baseGet)) return;
  Object.defineProperty(proto, property, {
    ...base,
    get(this: object): unknown {
      for (
        let p = Object.getPrototypeOf(this);
        p && p !== proto;
        p = Object.getPrototypeOf(p)
      ) {
        const own = Object.getOwnPropertyDescriptor(p, property)?.get;
        if (own) return own.call(this);
      }
      return baseGet.call(this);
    },
  });
};

// Must run before mermaid loads: DOMPurify keeps the getters it finds then.
export const repairNodeGetters = (window: {
  Node: { prototype: object };
}): void => {
  for (const property of NODE_GETTERS)
    dispatchToOverride(window.Node.prototype, property);
};

// A parse result depends only on its source, and a split plan measures the
// same candidate diagram many times over, so each source is parsed once. Every
// caller gets its own copy, so no caller can change what another reads.

const LIMIT = 512;

export const memoBySource = <T>(
  read: (source: string) => Promise<T>,
): ((source: string) => Promise<T>) => {
  const cache = new Map<string, Promise<T>>();
  return async (source) => {
    let hit = cache.get(source);
    if (!hit) {
      hit = read(source);
      cache.set(source, hit);
      const oldest = cache.keys().next().value;
      if (cache.size > LIMIT && oldest !== undefined) cache.delete(oldest);
    }
    return structuredClone(await hit);
  };
};

// Mermaid singleton lifecycle and its browser environment.

// mermaid core registers DOMPurify hooks while its grammars run, and DOMPurify
// needs a DOM. This runs before the first mermaid import, so mermaid is
// imported dynamically: a static import is hoisted above this call.
const installDomShim = (): void => {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const win = new Window();
  repairNodeGetters(win);
  g.window = win;
  g.document = win.document;
  g.Element = win.Element;
  g.HTMLElement = win.HTMLElement;
  g.Node = win.Node;
  g.DocumentFragment = win.DocumentFragment;
  g.NodeFilter = win.NodeFilter;
  g.getComputedStyle = win.getComputedStyle.bind(win);
  // happy-dom's CSS.supports("color", v) is true for any word, where a browser
  // checks that v is a colour. Mermaid asks it to split `box Shop` into a fill
  // and a title, so the shim's answer gave every one-word box title away as
  // its fill. A colour is whatever colorjs.io can parse.
  // happy-dom builds a fresh CSS object on each read, so the window's CSS is
  // replaced by one fixed object that carries the corrected check.
  const css = win.CSS;
  const supports = css.supports.bind(css);
  const fixed = {
    ...css,
    supports: (property: string, value?: string): boolean => {
      if (value === undefined) return supports(property);
      return property === "color"
        ? isCssColour(value)
        : supports(property, value);
    },
  };
  Object.defineProperty(win, "CSS", { value: fixed, configurable: true });
};

const isCssColour = (value: string): boolean => Color.try(value) !== null;

// ZenUML is drawn by an external add-on (@mermaid-js/mermaid-zenuml) that this
// package does not ship. Mermaid's API for an external diagram registers its
// detector alone, so mermaid's own detection names a zenuml diagram, as the
// add-on's detector does, and loading it fails with the reason. Mermaid core
// has no zenuml detector of its own, a gap SLOP-0024 records.
const ZENUML = {
  id: "zenuml",
  detector: (text: string): boolean => /^\s*zenuml/.test(text),
  loader: (): Promise<never> =>
    Promise.reject(
      new Error(
        "zenuml is drawn by an external mermaid add-on that is not installed",
      ),
    ),
};

// Mermaid core is loaded once, when this module loads, so its diagram detection
// is there for synchronous type detection. The shim goes in first, and
// initialize registers every diagram's detector.
const loadMermaid = async (): Promise<typeof import("mermaid").default> => {
  installDomShim();
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({});
  await mermaid.registerExternalDiagrams([ZENUML]);
  return mermaid;
};

const mermaidCore = await loadMermaid();

export type MermaidCore = typeof import("mermaid").default;

export const getMermaidCore = async (): Promise<MermaidCore> => mermaidCore;

// The diagram type mermaid's own detection gives a diagram, past its
// frontmatter, directives and comments, or null when mermaid detects none.
export const detectType = (content: string): string | null => {
  try {
    return mermaidCore.detectType(content);
  } catch (err) {
    if (err instanceof Error && err.name === "UnknownDiagramError") return null;
    throw err;
  }
};
