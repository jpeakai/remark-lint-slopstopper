import { spawnSync } from "node:child_process";
import { chmod, copyFile, cp, mkdir, mkdtemp, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { Options } from "./options.ts";

async function authenticationFile(explicit?: string): Promise<string | undefined> {
  if (explicit) {
    return realpath(resolve(explicit));
  }

  if (process.env.CODEX_API_KEY?.trim()) {
    return;
  }

  const sourceHome = process.env.CODEX_HOME || join(homedir(), ".codex");

  return realpath(join(sourceHome, "auth.json")).catch((error: NodeJS.ErrnoException): undefined => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}

function verifyAuthentication(root: string, home: string): void {
  if (process.env.CODEX_API_KEY?.trim()) {
    return;
  }

  const result = spawnSync("codex", ["login", "status"], {
    cwd: root,
    env: { ...process.env, CODEX_HOME: home },
    stdio: "ignore",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      "Codex is not authenticated in the isolated home. Run codex login, or supply --auth-file PATH or CODEX_API_KEY, then retry. No fixed diagrams were reset.",
    );
  }
}

async function selectedSkills(paths: string[]): Promise<string[]> {
  const sources = await Promise.all(paths.map((path) => realpath(resolve(path))));
  const names = new Set<string>();

  for (const source of sources) {
    if (!(await stat(join(source, "SKILL.md"))).isFile()) {
      throw new Error(`Expected a skill folder: ${source}`);
    }

    const name = basename(source);

    if (names.has(name)) {
      throw new Error(`Duplicate skill folder name: ${name}`);
    }

    names.add(name);
  }

  return sources;
}

async function createHome(root: string, requested?: string): Promise<string> {
  if (requested) {
    const home = resolve(requested);

    await mkdir(dirname(home), { recursive: true });
    await mkdir(home, { mode: 0o700 });

    return home;
  }

  const runs = join(root, "tmp", "codex-runs");

  await mkdir(runs, { recursive: true });

  return mkdtemp(join(runs, "run-"));
}

export async function prepareCodexHome(root: string, options: Options) {
  const sources = await selectedSkills(options.skills);
  const auth = await authenticationFile(options.authFile);

  if (auth && !(await stat(auth)).isFile()) {
    throw new Error("Expected an authentication file");
  }

  const home = await createHome(root, options.codexHome);
  const skills: string[] = [];

  for (const source of sources) {
    const target = join(home, "skills", basename(source));

    await cp(source, target, { recursive: true, dereference: true });
    skills.push(join(target, "SKILL.md"));
  }

  if (auth) {
    await copyFile(auth, join(home, "auth.json"));
    await chmod(join(home, "auth.json"), 0o600);
  }

  verifyAuthentication(root, home);

  return { home, skills };
}
