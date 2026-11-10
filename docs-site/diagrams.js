import mermaid from "mermaid-site";

let revision = 0;
let queue = Promise.resolve();
let sequence = 0;
const diagrams = [];
const dark = () => document.body.dataset.mdColorScheme === "slate";

function prepareDiagram(block) {
  const source = block.querySelector("code")?.textContent ?? block.textContent;
  const figure = document.createElement("figure");
  const preview = document.createElement("div");
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  const expand = document.createElement("button");

  figure.className = "example-figure";
  preview.className = "diagram-preview";
  preview.setAttribute("aria-live", "polite");
  summary.textContent = "Mermaid source";
  expand.type = "button";
  expand.className = "diagram-expand";
  expand.textContent = "Enlarge diagram";
  expand.disabled = true;
  block.replaceWith(figure);
  details.append(summary, block);
  figure.append(preview, expand, details);
  expand.addEventListener("click", () => openDiagram(preview, expand));
  diagrams.push({ source, preview, expand });
}

async function renderDiagram(diagram, version) {
  const { source, preview, expand } = diagram;

  if (version !== revision) {
    return;
  }

  preview.textContent = "Rendering diagram…";
  expand.disabled = true;

  try {
    const { svg, bindFunctions } = await mermaid.render(`comparison-${++sequence}`, source);

    if (version !== revision) {
      return;
    }

    preview.innerHTML = svg;
    bindFunctions?.(preview);
    expand.disabled = false;
  } catch (error) {
    if (version === revision) {
      preview.textContent = `Cannot render this fixture: ${error instanceof Error ? error.message : String(error)}`;
      preview.classList.add("diagram-error");
    }
  }
}

function scheduleRender() {
  const version = ++revision;

  dialog.close();
  queue = queue.then(async () => {
    if (version !== revision) {
      return;
    }

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: dark() ? "dark" : "default",
    });

    for (const diagram of diagrams) {
      diagram.preview.classList.remove("diagram-error");
      await renderDiagram(diagram, version);
    }
  });
}

function createViewer() {
  const viewer = document.createElement("dialog");

  viewer.className = "diagram-dialog";
  viewer.setAttribute("aria-label", "Expanded diagram");
  viewer.innerHTML = `<div class="diagram-toolbar">
    <button type="button" data-action="out" aria-label="Zoom out">−</button>
    <output aria-live="polite">100%</output>
    <button type="button" data-action="in" aria-label="Zoom in">+</button>
    <button type="button" data-action="fit">Fit</button>
    <button type="button" data-action="actual">100%</button>
    <button type="button" data-action="close">Close</button>
  </div><div class="diagram-viewport"><div class="diagram-content"></div></div>`;
  document.body.append(viewer);

  return viewer;
}

const dialog = createViewer();
const content = dialog.querySelector(".diagram-content");
const viewport = dialog.querySelector(".diagram-viewport");
let active;
let dimensions = { width: 1, height: 1 };
let scale = 1;

function zoom(next) {
  scale = Math.max(0.05, Math.min(8, next));
  content.style.width = `${dimensions.width * scale}px`;
  content.style.height = `${dimensions.height * scale}px`;
  dialog.querySelector("output").value = `${Math.round(scale * 100)}%`;
}

function fit() {
  zoom(Math.min((viewport.clientWidth - 32) / dimensions.width, (viewport.clientHeight - 32) / dimensions.height));
}

function openDiagram(preview, invoker) {
  const svg = preview.querySelector("svg");

  if (!svg) {
    return;
  }

  active = { svg, preview, invoker, style: svg.getAttribute("style") };
  dimensions = { width: svg.viewBox.baseVal.width, height: svg.viewBox.baseVal.height };
  content.replaceChildren(svg);
  svg.style.maxWidth = "none";
  svg.style.width = "100%";
  svg.style.height = "100%";
  dialog.showModal();
  fit();
}

dialog.addEventListener("close", () => {
  if (!active) {
    return;
  }

  const { svg, preview, invoker, style } = active;

  if (style === null) {
    svg.removeAttribute("style");
  } else {
    svg.setAttribute("style", style);
  }

  preview.replaceChildren(svg);
  invoker.focus({ preventScroll: true });
  active = undefined;
});

const actions = {
  in: () => zoom(scale * 1.25),
  out: () => zoom(scale / 1.25),
  fit,
  actual: () => zoom(1),
  close: () => dialog.close(),
};

for (const button of dialog.querySelectorAll("[data-action]")) {
  button.addEventListener("click", () => actions[button.dataset.action]());
}

for (const block of document.querySelectorAll("pre.example-mermaid")) {
  prepareDiagram(block);
}

if (diagrams.length) {
  new MutationObserver(scheduleRender).observe(document.body, {
    attributes: true,
    attributeFilter: ["data-md-color-scheme"],
  });
  scheduleRender();
}
