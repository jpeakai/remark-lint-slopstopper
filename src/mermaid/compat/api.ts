import type { MermaidConfig } from "mermaid";
import type { MermaidCore } from "../parsing/engine.ts";
import type { Diagram } from "./types.ts";

// Mermaid deprecates mermaidAPI but offers no public replacement for these two
// capabilities, so this module is the only place that touches it. Retire it
// when Mermaid exposes a parsed diagram's database and the resolved site
// configuration through its supported API.

// A parsed diagram with its official database, as the renderer would build it.
export const diagramFromText = async (core: MermaidCore, source: string): Promise<Diagram> =>
  (await core.mermaidAPI.getDiagramFromText(source)) as unknown as Diagram;

// The configuration Mermaid has resolved, including derived theme variables.
export const siteConfig = (core: MermaidCore): MermaidConfig => core.mermaidAPI.getSiteConfig();
