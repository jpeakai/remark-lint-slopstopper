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

// Options that take a path, and where each one lands.
const PATH_OPTIONS: Record<string, (options: Options, value: string) => void> = {
  "--skill": (options, value) => {
    options.skills.push(value);
  },
  "--codex-home": (options, value) => {
    options.codexHome = value;
  },
  "--auth-file": (options, value) => {
    options.authFile = value;
  },
  "--browser": (options, value) => {
    options.browser = value;
  },
};

function consumeRender(args: string[], options: Options): void {
  const value = args.shift();

  if (value !== "full" && value !== "matched") {
    throw new Error("Expected full or matched after --render");
  }

  options.render = value;
}

function consumeOption(arg: string, args: string[], options: Options): void {
  if (arg === "--render") {
    consumeRender(args, options);

    return;
  }

  const assign = PATH_OPTIONS[arg];

  if (!assign) {
    options.codexArgs.push(arg);

    return;
  }

  const value = args.shift();

  if (!value || value.startsWith("-")) {
    throw new Error(`Expected a path after ${arg}`);
  }

  assign(options, value);
}
