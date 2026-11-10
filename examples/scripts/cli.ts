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

function consumeOption(arg: string, args: string[], options: Options): void {
  if (arg !== "--skill" && arg !== "--codex-home" && arg !== "--auth-file") {
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
  } else {
    options.authFile = value;
  }
}
