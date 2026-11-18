import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { prepareCodexHome } from "./codex-home.ts";
import { guardExamples } from "./families.ts";
import type { Options } from "./options.ts";
import { type Matrix, renderExamples, resolveBrowser, verifyRenderer } from "./render.ts";

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

export interface AgentOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;

  // The first cancellation the parent received, whatever the child did with it.
  cancelled: NodeJS.Signals | null;
}

// Run an agent with the prompt on stdin, forwarding cancellation to it. The
// parent remembers its own first cancellation, because a child may catch the
// signal and still exit zero.
export function runAgent(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; input: string },
): Promise<AgentOutcome> {
  return new Promise((resolve, reject) => {
    let cancelled: NodeJS.Signals | null = null;
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["pipe", "inherit", "inherit"] });
    const forward = (signal: NodeJS.Signals) => () => {
      cancelled ??= signal;
      child.kill(signal);
    };

    const interrupt = forward("SIGINT");
    const terminate = forward("SIGTERM");
    const cleanup = () => {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", terminate);
    };

    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") {
        cleanup();
        reject(error);
      }
    });
    child.stdin.end(options.input);
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("exit", (code, signal) => {
      cleanup();
      resolve({ code, signal, cancelled });
    });
  });
}

// Apply an agent's outcome to this process. A cancellation, the parent's or
// the child's own signal, ends this process with that signal once the
// forwarding listeners are gone; nothing after it may run.
export function settleAgent(outcome: AgentOutcome): "cancelled" | "failed" | "succeeded" {
  const signal = outcome.cancelled ?? outcome.signal;

  if (signal) {
    process.kill(process.pid, signal);

    return "cancelled";
  }

  process.exitCode = outcome.code ?? 1;

  return outcome.code === 0 ? "succeeded" : "failed";
}

function runCodex(root: string, { home, args, prompt, shared }: CodexRun): Promise<AgentOutcome> {
  return runAgent("codex", ["exec", "--sandbox", "workspace-write", ...args, "-"], {
    cwd: root,
    env: { ...process.env, ...shared, CODEX_HOME: home },
    input: prompt,
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

  const outcome = settleAgent(
    await runCodex(root, { home, args: options.codexArgs, prompt, shared: { CHROME_PATH: browser, TMPDIR: scratch } }),
  );

  if (outcome === "cancelled") {
    return;
  }

  // A repair keeps each example's family unless a mapping approves a
  // translation that keeps the original's facts.
  const problems = await guardExamples(root, names);

  if (problems.length) {
    throw new Error(`Repaired diagrams failed the family guard:\n${problems.join("\n")}`);
  }

  if (outcome === "failed") {
    return;
  }

  await verifyRepairRenders(root, names, {
    executablePath: browser,
    out: join(home, "renders"),
    matrix: options.render,
  });
}

// A later check must not turn an agent's nonzero exit into a generic 1.
export const failureExitCode = (current: string | number | null | undefined): number =>
  typeof current === "number" && current !== 0 ? current : 1;

// Render each selected comparison and fail on any missing, empty or invalid
// artifact; the manifest stays in the run directory as evidence.
export async function verifyRepairRenders(
  root: string,
  names: readonly string[],
  render: { executablePath: string; out: string; matrix?: Matrix | undefined },
): Promise<void> {
  const manifest = await renderExamples(root, {
    set: "comparison",
    examples: [...names],
    out: render.out,
    executablePath: render.executablePath,
    matrix: render.matrix ?? "full",
  });

  console.error(`Render manifest: ${join(render.out, "comparison", "manifest.json")}`);

  if (manifest.failures.length) {
    throw new Error(
      `Repaired diagrams failed render verification:\n${manifest.failures.map((f) => `${f.scenario}: ${f.reason}`).join("\n")}`,
    );
  }
}
