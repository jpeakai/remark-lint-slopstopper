import type { MermaidConfig } from "mermaid";

// The one custom themeCSS the contrast audit models: an opaque white outline
// drawn behind each glyph of a family's native text. With the stroke painted
// first, every glyph sits on the outline, so the outline is its backing.
// Anything else in themeCSS stays unmodelled and is reported.

// The native SVG text selector of each family the recipe supports.
export const OUTLINE_SELECTORS: Readonly<Record<string, string>> = {
  c4: "text",
  treeView: ".treeView-node-label",
};

const RECIPE: Readonly<Record<string, string>> = {
  "paint-order": "stroke",
  stroke: "#ffffff",
  "stroke-width": "3px",
  "stroke-linejoin": "round",
};

export const OUTLINE_COLOUR = "#ffffff";

const recipeText = (selector: string) =>
  `${selector} { ${Object.entries(RECIPE)
    .map(([property, value]) => `${property}: ${value};`)
    .join(" ")} }`;

function declarations(body: string): [string, string][] {
  return body
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf(":");

      if (at < 1) {
        throw new Error(`themeCSS declaration "${part}" is not a property and value`);
      }

      return [
        part.slice(0, at).trim().toLowerCase(),
        part
          .slice(at + 1)
          .trim()
          .toLowerCase(),
      ];
    });
}

function checkDeclarations(found: [string, string][]): void {
  const extra = found.filter(([property]) => !(property in RECIPE)).map(([property]) => property);

  if (extra.length) {
    throw new Error(`themeCSS declarations ${extra.join(", ")} are not part of the text outline recipe`);
  }

  for (const [property, value] of Object.entries(RECIPE)) {
    const own = found.filter(([name]) => name === property);

    if (own.length !== 1) {
      throw new Error(`the text outline recipe needs exactly one ${property}: ${value}`);
    }

    if (own[0]?.[1] !== value) {
      throw new Error(`themeCSS ${property}: ${own[0]?.[1]} is unsupported paint; the outline recipe uses ${value}`);
    }
  }
}

// The outline backing a family's text, or an error naming why the themeCSS
// cannot be modelled.
export function textOutline(themeCSS: string, kind: string, config: MermaidConfig): string {
  const selector = OUTLINE_SELECTORS[kind];

  if (!selector) {
    throw new Error("custom themeCSS is not modeled");
  }

  if (kind === "c4" && (config.c4 as { textPlacement?: string } | undefined)?.textPlacement === "fo") {
    throw new Error("C4 HTML text cannot carry an SVG text outline");
  }

  const css = themeCSS.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const rule = /^([^{}]+)\{([^{}]*)\}$/.exec(css);

  if (!rule) {
    throw new Error(`custom themeCSS must be exactly one rule: ${recipeText(selector)}`);
  }

  const found = (rule[1] ?? "").trim().replace(/\s+/g, " ");

  if (found !== selector) {
    throw new Error(`themeCSS selector "${found}" is not the native ${kind} text selector "${selector}"`);
  }

  checkDeclarations(declarations(rule[2] ?? ""));

  return OUTLINE_COLOUR;
}

// Whether a family's surface is drawn by the element the recipe selects:
// every C4 text, but only TreeView node labels, not their descriptions.
export function outlined(kind: string, surfaceName: string): boolean {
  return (
    kind === "c4" || (kind === "treeView" && surfaceName !== "diagram title" && !surfaceName.endsWith(" description"))
  );
}
