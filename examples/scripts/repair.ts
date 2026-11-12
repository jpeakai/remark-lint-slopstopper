import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { prepareCodexHome } from "./codex-home.ts";
import { guardExamples } from "./families.ts";
import type { Options } from "./options.ts";
import { resolveBrowser, verifyRenderer } from "./render.ts";

async function exampleNames(root: string, selection?: string): Promise<string[]> {
  if (selection) {
    const name = selection.replace(/^examples\//, "");

    if (!name || name === "." || name === ".." || /[/\\]/.test(name)) {
      throw new Error("Expected an example folder name");
    }

    const source = join(root, "examples", name, "diagram.md");

    if (!(await stat(source).catch(() => null))?.isFile()) {
      throw new Error(`Unknown example: ${selection}`);
    }

    return [name];
  }

  const entries = await readdir(join(root, "examples"), {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isDirectory() && /^\d{2,}-/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

interface CodexRun {
  home: string;
  args: string[];
  prompt: string;

  // Environment the verified preflight hands to Codex and its subagents.
  shared: Record<string, string>;
}

function runCodex(root: string, { home, args, prompt, shared }: CodexRun): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["exec", "--sandbox", "workspace-write", ...args, "-"], {
      cwd: root,
      env: { ...process.env, ...shared, CODEX_HOME: home },
      stdio: ["pipe", "inherit", "inherit"],
    });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    const cleanup = () => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
    };

    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") {
        reject(error);
      }
    });
    child.stdin.end(prompt);
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("exit", (code, signal) => {
      cleanup();

      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exitCode = code ?? 1;
      }

      resolve();
    });
  });
}

export async function repairExamples(root: string, options: Options): Promise<void> {
  const names = await exampleNames(root, options.example);

  if (!names.length) {
    throw new Error("No examples found");
  }

  let prompt = await readFile(join(root, "examples", "fix-prompt.md"), "utf8");

  // Visual verification must work before any comparison is overwritten, and
  // before a run directory receives a copy of the saved login.
  const browser = await resolveBrowser(options.browser ?? process.env.CHROME_PATH).catch((error: Error) => {
    throw new Error(`${error.message} No fixed diagrams were reset.`);
  });

  await verifyRenderer(browser).catch((error: Error) => {
    throw new Error(`${error.message} No fixed diagrams were reset.`);
  });

  const { home, skills } = await prepareCodexHome(root, options);
  const scratch = join(home, "tmp");

  await mkdir(scratch, { recursive: true });
  console.error(`Browser: ${browser}`);

  console.error(`Codex home: ${home}`);

  if (skills.length) {
    prompt += `\nUse these local skills for repair guidance for the jpai-essentials:mermaidjs-diagrams guidance. Read their SKILL.md files and relevant references, and pass these paths to every subagent:\n${skills.map((path) => `- ${path}`).join("\n")}\n`;
  }

  if (names.length === 1) {
    prompt += `\nFor this run, restrict all delegation, edits and verification to examples/${names[0]}/diagram-fixed.md. Leave every other example unchanged.\n`;
  }

  for (const name of names) {
    await copyFile(join(root, "examples", name, "diagram.md"), join(root, "examples", name, "diagram-fixed.md"));
  }

  await runCodex(root, { home, args: options.codexArgs, prompt, shared: { CHROME_PATH: browser, TMPDIR: scratch } });

  // A repair keeps each example's family unless a mapping approves a
  // translation that keeps the original's facts.
  const problems = await guardExamples(root, names);

  if (problems.length) {
    throw new Error(`Repaired diagrams failed the family guard:\n${problems.join("\n")}`);
  }
}
