import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { resolveBrowser } from "./render.ts";

test("an explicit browser must be an executable file", async (t) => {
  const scratch = new URL("../../tmp/", import.meta.url);

  await mkdir(scratch, { recursive: true });

  const root = await mkdtemp(join(scratch.pathname, "browser-resolution-"));
  const plain = join(root, "chrome");

  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(plain, "#!/bin/sh\n");
  await chmod(plain, 0o644);

  for (const candidate of [join(root, "missing"), root, plain]) {
    await assert.rejects(resolveBrowser(candidate), /Browser executable not found or not executable/);
  }

  await chmod(plain, 0o755);
  assert.equal(await resolveBrowser(plain), plain);
});
