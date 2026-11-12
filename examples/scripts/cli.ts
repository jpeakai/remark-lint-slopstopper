import type { Options } from "./options.ts";

export function parseOptions(argv: string[]): Options {
  const args = [...argv];
  const options: Options = { skills: [], codexArgs: [] };

  if (args[0] && !args[0].startsWith("-")) {
    options.example = args.shift();
  }

  while (args.length) {
    const arg = args.shift();

    if (arg === "--") {
      options.codexArgs.push(...args);
      break;
    }

    if (arg) {
      consumeOption(arg, args, options);
    }
  }

  return options;
}

const PATH_OPTIONS = new Set(["--skill", "--codex-home", "--auth-file", "--browser"]);

function consumeOption(arg: string, args: string[], options: Options): void {
  if (!PATH_OPTIONS.has(arg)) {
    options.codexArgs.push(arg);

    return;
  }

  const value = args.shift();

  if (!value || value.startsWith("-")) {
    throw new Error(`Expected a path after ${arg}`);
  }

  if (arg === "--skill") {
    options.skills.push(value);
  } else if (arg === "--codex-home") {
    options.codexHome = value;
  } else if (arg === "--browser") {
    options.browser = value;
  } else {
    options.authFile = value;
  }
}
