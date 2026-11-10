import assert from "node:assert/strict";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const prefix = "/remark-lint-slopstopper/";
const site = join(root, "tmp/site");
const mime = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".html": "text/html" };
let server;
let browser;
let base;

async function serve(request, response) {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    let file = resolve(site, `.${path.slice(prefix.length - 1)}`);

    assert(path.startsWith(prefix) && file.startsWith(site));

    if ((await stat(file)).isDirectory()) {
      file = join(file, "index.html");
    }

    response.setHeader("Content-Type", mime[extname(file)] ?? "text/plain");
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
}

before(async () => {
  await mkdir(join(root, "tmp/site-review"), { recursive: true });
  server = createServer(serve);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}${prefix}`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

test("Examples lists all 31 diagram pairs as direct child pages", async () => {
  const page = await browser.newPage();
  await page.goto(`${base}examples/`);
  const direct = await page.evaluate(() => {
    const nav = [...document.querySelectorAll('nav[data-md-level="1"]')].find(
      (node) => node.querySelector(":scope > label")?.textContent.trim() === "Examples",
    );

    return [...nav.querySelectorAll(":scope > ul > li > a")]
      .map((link) => new URL(link.href).pathname)
      .filter((path) => /\/examples\/\d{2}-/.test(path));
  });

  assert.equal(direct.length, 31);
  assert(direct.every((path) => !path.includes("/gallery/")));
  assert.equal(await page.locator(".md-content .grid.cards a").count(), 31);
  await page.screenshot({ path: join(root, "tmp/site-review/examples-index.png") });
  await page.close();
});

async function verifyPair(page, name) {
  const response = await page.goto(`${base}examples/${name}/`);
  assert.equal(response.status(), 200, name);
  await page.waitForFunction(() => {
    const previews = [...document.querySelectorAll(".diagram-preview")];

    return (
      previews.length >= 2 &&
      previews.every((node) => node.querySelector("svg") || node.classList.contains("diagram-error"))
    );
  });
  const errors = await page.locator(".diagram-error").allTextContents();

  assert.deepEqual(errors, [], name);
  assert.equal(await page.locator(".example-panel").count(), 2, name);

  for (const panel of await page.locator(".example-panel").all()) {
    assert((await panel.locator("svg").count()) > 0, name);
  }
}

test("every Before and After pair renders as SVG", { timeout: 180000 }, async () => {
  const names = (await readdir(join(root, "examples"))).filter((name) => /^\d{2}-/.test(name));
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  for (const name of names) {
    await verifyPair(page, name);
  }

  await page.close();
});

test("comparison diagrams support both themes and the enlarged viewer", async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.emulateMedia({ colorScheme: "dark" });
  await verifyPair(page, "03-flowchart--unreadable-label--text-against-node-fills");
  await mkdir(join(root, "tmp/site-review"), { recursive: true });

  for (const theme of ["default", "slate"]) {
    await page.locator(`label[title="Switch to ${theme === "slate" ? "dark" : "light"} theme"]`).click();
    await page.waitForFunction((scheme) => document.body.dataset.mdColorScheme === scheme, theme);
    await page.waitForFunction(() =>
      [...document.querySelectorAll(".diagram-expand")].every((button) => !button.disabled),
    );
    await page.screenshot({ path: join(root, `tmp/site-review/${theme}.png`), fullPage: true });
  }

  await page.getByRole("button", { name: "Enlarge diagram" }).first().click();
  assert(await page.getByRole("dialog", { name: "Expanded diagram" }).isVisible());
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(await page.locator(".example-panel svg").count(), 2);
  await page.goto(`${base}examples/mermaid/`);
  await page.waitForURL(`${base}examples/`);
  await page.close();
});
