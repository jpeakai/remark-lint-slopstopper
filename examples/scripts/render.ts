import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parseDocument } from "htmlparser2";
import { type Browser, chromium, type Page } from "playwright";
import { createDocument } from "../../src/document/context.ts";
import { fences } from "../../src/mermaid/markdown.ts";

// Deterministic render verification for the diagram examples. A renderer can
// exit cleanly and still write an empty or truncated file, so every artifact
// is checked against the scenario matrix the parsed fences demand.

export const THEMES = { light: "default", dark: "dark" } as const;
export const BACKGROUNDS = { white: "#ffffff", black: "#000000", transparent: "transparent" } as const;
export const FORMATS = ["png", "svg"] as const;

export type ThemeName = keyof typeof THEMES;
export type BackgroundName = keyof typeof BACKGROUNDS;
export type Format = (typeof FORMATS)[number];

// Comparisons must render; originals may fail on purpose, so their render
// errors are recorded as outcomes in a separate manifest instead.
export type ExampleSet = "comparison" | "original";

const SET_FILES: Record<ExampleSet, string> = { comparison: "diagram-fixed.md", original: "diagram.md" };

export interface DiagramSource {
  index: number;
  line: number;
  sha256: string;
  source: string;
}

export interface Scenario {
  id: string;
  example: string;
  fence: number;
  theme: ThemeName;
  background: BackgroundName;
  format: Format;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface Artifact extends Scenario, Dimensions {
  path: string;
  bytes: number;
}

export interface ScenarioFailure {
  scenario: string;
  reason: string;
}

export interface FileRecord {
  example: string;
  path: string;
  sha256: string;
  fences: Omit<DiagramSource, "source">[];
}

export interface Manifest {
  set: ExampleSet;
  renderer: { mermaid: string; browser: string };
  files: FileRecord[];
  expected: number;
  artifacts: Artifact[];
  renderErrors: ScenarioFailure[];
  failures: ScenarioFailure[];
}

export interface RenderOptions {
  set: ExampleSet;
  examples?: string[];
  out: string;
  executablePath?: string;
}

const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function pngDimensions(bytes: Uint8Array): Dimensions {
  if (bytes.length < 24 || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error("not a PNG: the signature is missing");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") {
    throw new Error("not a PNG: the first chunk is not IHDR");
  }

  const dimensions = { width: view.getUint32(16), height: view.getUint32(20) };

  if (!dimensions.width || !dimensions.height) {
    throw new Error(`PNG has empty dimensions ${dimensions.width}x${dimensions.height}`);
  }

  return dimensions;
}

const LENGTH = /^\s*([0-9]*\.?[0-9]+)(px)?\s*$/;

export function svgDimensions(text: string): Dimensions {
  const root = parseDocument(text, { xmlMode: true }).children.find((node) => node.type === "tag") as
    | { name: string; attribs: Record<string, string | undefined> }
    | undefined;

  if (root?.name !== "svg") {
    throw new Error("not an SVG: the root element is not <svg>");
  }

  const { width, height, viewBox } = root.attribs;
  const absolute = [width, height].map((value) => LENGTH.exec(value ?? "")?.[1]);
  const box = viewBox?.trim().split(/[\s,]+/).map(Number);
  const [w, h] =
    absolute[0] && absolute[1] ? absolute.map(Number) : box?.length === 4 ? box.slice(2) : [Number.NaN, Number.NaN];

  if (!(Number(w) > 0 && Number(h) > 0)) {
    throw new Error(`SVG has no positive dimensions (width ${width}, height ${height}, viewBox ${viewBox})`);
  }

  return { width: Number(w), height: Number(h) };
}

export function diagramSources(markdown: string): DiagramSource[] {
  return fences(createDocument(markdown)).map((fence, index) => ({
    index: index + 1,
    line: markdown.slice(0, fence.start).split("\n").length,
    sha256: sha256(fence.value),
    source: fence.value,
  }));
}

export function scenarios(example: string, sources: readonly DiagramSource[]): Scenario[] {
  return sources.flatMap(({ index }) =>
    (Object.keys(THEMES) as ThemeName[]).flatMap((theme) =>
      (Object.keys(BACKGROUNDS) as BackgroundName[]).flatMap((background) =>
        FORMATS.map((format) => ({
          id: `${example}#${index}/${theme}/${background}/${format}`,
          example,
          fence: index,
          theme,
          background,
          format,
        })),
      ),
    ),
  );
}

export async function exampleNames(root: string, selection: readonly string[] = []): Promise<string[]> {
  const names = selection.length
    ? selection.map((name) => name.replace(/^examples\//, "").replace(/\/$/, ""))
    : (await readdir(join(root, "examples"), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && /^\d{2,}-/.test(entry.name))
        .map((entry) => entry.name)
        .sort();

  for (const name of names) {
    if (!name || name === "." || name === ".." || /[/\\]/.test(name)) {
      throw new Error(`Expected an example folder name, not ${name}`);
    }

    if (!(await stat(join(root, "examples", name)).catch(() => null))?.isDirectory()) {
      throw new Error(`Unknown example: ${name}`);
    }
  }

  if (!names.length) {
    throw new Error("No examples found");
  }

  return names;
}

interface Rendered {
  svg: string;
  png: Uint8Array;
}

const STAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent"><div id="stage" style="display:inline-block;padding:8px"></div></body></html>`;

async function renderScenario(page: Page, source: string, theme: ThemeName, background: BackgroundName): Promise<Rendered> {
  const svg = await page.evaluate(
    async ({ source, theme, colour }) => {
      const runtime = (globalThis as unknown as { mermaid: MermaidGlobal }).mermaid;
      const stage = document.getElementById("stage") as HTMLElement;

      stage.replaceChildren();
      stage.style.background = colour;
      runtime.initialize({ startOnLoad: false, theme, securityLevel: "strict" });

      const { svg } = await runtime.render(`render-${Date.now()}`, source);

      stage.innerHTML = svg;

      const root = stage.querySelector("svg") as SVGSVGElement;
      const box = root.getBBox();

      if (!(box.width > 0 && box.height > 0)) {
        throw new Error(`rendered SVG paints nothing (${box.width}x${box.height})`);
      }

      if (colour !== "transparent") {
        root.style.backgroundColor = colour;
      }

      return new XMLSerializer().serializeToString(root);
    },
    { source, theme: THEMES[theme], colour: BACKGROUNDS[background] },
  );
  const png = await page.locator("#stage").screenshot({ omitBackground: background === "transparent" });

  return { svg, png };
}

interface MermaidGlobal {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<{ svg: string }>;
}

const message = (error: unknown): string => (error instanceof Error ? error.message.split("\n")[0] : String(error));

async function newStage(browser: Browser, mermaidScript: string): Promise<Page> {
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  await page.setContent(STAGE);
  await page.addScriptTag({ path: mermaidScript });

  return page;
}

async function writeArtifact(
  out: string,
  scenario: Scenario,
  bytes: Uint8Array | string,
): Promise<{ path: string; bytes: number }> {
  const path = join(out, scenario.example, `fence-${scenario.fence}--${scenario.theme}--${scenario.background}.${scenario.format}`);

  await mkdir(join(out, scenario.example), { recursive: true });
  await writeFile(path, bytes);

  return { path, bytes: (await stat(path)).size };
}

// Re-read every written file, so the manifest describes what is on disk.
async function verifyArtifact(path: string, format: Format): Promise<Dimensions> {
  const bytes = await readFile(path);

  if (!bytes.length) {
    throw new Error("artifact is empty");
  }

  return format === "png" ? pngDimensions(bytes) : svgDimensions(bytes.toString("utf8"));
}

export async function renderExamples(root: string, options: RenderOptions): Promise<Manifest> {
  const names = await exampleNames(root, options.examples);
  const out = join(options.out, options.set);
  const mermaidScript = join(root, "node_modules", "mermaid-site", "dist", "mermaid.min.js");
  const { version: mermaid } = JSON.parse(
    await readFile(join(root, "node_modules", "mermaid-site", "package.json"), "utf8"),
  ) as { version: string };
  const browser = await chromium.launch(options.executablePath ? { executablePath: options.executablePath } : {});
  const manifest: Manifest = {
    set: options.set,
    renderer: { mermaid, browser: browser.version() },
    files: [],
    expected: 0,
    artifacts: [],
    renderErrors: [],
    failures: [],
  };

  try {
    const page = await newStage(browser, mermaidScript);

    for (const example of names) {
      const path = join(root, "examples", example, SET_FILES[options.set]);
      const markdown = await readFile(path, "utf8");
      const sources = diagramSources(markdown);
      const expected = scenarios(example, sources);

      manifest.files.push({
        example,
        path: relative(root, path),
        sha256: sha256(markdown),
        fences: sources.map(({ source: _, ...record }) => record),
      });
      manifest.expected += expected.length;

      if (!sources.length) {
        manifest.failures.push({ scenario: example, reason: `${relative(root, path)} has no Mermaid fences` });
      }

      await renderFile(page, sources, expected, out, manifest);
    }
  } finally {
    await browser.close();
  }

  if (manifest.artifacts.length + countSkipped(manifest) !== manifest.expected) {
    manifest.failures.push({
      scenario: "matrix",
      reason: `expected ${manifest.expected} artifacts, accounted for ${manifest.artifacts.length + countSkipped(manifest)}`,
    });
  }

  await mkdir(out, { recursive: true });
  await writeFile(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}

// Each render error stands for both formats of its scenario.
const countSkipped = (manifest: Manifest): number => manifest.renderErrors.length * FORMATS.length;

async function renderFile(
  page: Page,
  sources: readonly DiagramSource[],
  expected: readonly Scenario[],
  out: string,
  manifest: Manifest,
): Promise<void> {
  const groups = new Map<string, Scenario[]>();

  for (const scenario of expected) {
    const key = scenario.id.slice(0, scenario.id.lastIndexOf("/"));

    groups.set(key, [...(groups.get(key) ?? []), scenario]);
  }

  for (const [key, group] of groups) {
    const [first] = group;

    if (!first) {
      continue;
    }

    const source = sources[first.fence - 1]?.source ?? "";
    let rendered: Rendered;

    try {
      rendered = await renderScenario(page, source, first.theme, first.background);
    } catch (error) {
      const failure = { scenario: key, reason: message(error) };

      if (manifest.set === "original") {
        manifest.renderErrors.push(failure);
      } else {
        manifest.failures.push(...group.map((scenario) => ({ scenario: scenario.id, reason: failure.reason })));
      }

      continue;
    }

    for (const scenario of group) {
      await recordArtifact(out, scenario, rendered, manifest);
    }
  }
}

async function recordArtifact(out: string, scenario: Scenario, rendered: Rendered, manifest: Manifest): Promise<void> {
  try {
    const written = await writeArtifact(out, scenario, scenario.format === "png" ? rendered.png : rendered.svg);
    const dimensions = await verifyArtifact(written.path, scenario.format);

    manifest.artifacts.push({ ...scenario, ...written, path: relative(out, written.path), ...dimensions });
  } catch (error) {
    manifest.failures.push({ scenario: scenario.id, reason: message(error) });
  }
}
