import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import remarkParse from "remark-parse";
import { type Plugin, unified } from "unified";
import { type Context, engine, type Options } from "unified-engine";
import recommended from "../../index.ts";
import slopstopper from "../remark/plugin.ts";
import { type CliArguments, pluginOptions } from "./arguments.ts";
import { jsonReporter } from "./report.ts";

type Streams = Pick<Options, "streamIn" | "streamOut" | "streamError">;

function execute(
  options: Options,
): Promise<{ code: number; context: Context }> {
  return new Promise((resolve, reject) => {
    engine(options, (error, code, context) => {
      if (error) reject(error);
      else if (context) resolve({ code: code ?? 2, context });
      else
        reject(new Error("The remark engine returned no processing context"));
    });
  });
}

async function writeEdits(context: Context) {
  for (const file of context.files) {
    const edits = file.data.slopstopperFixes;
    if (!(file.path && Array.isArray(edits) && edits.length)) continue;
    // The engine refuses writes on any fatal finding. Verified edits may
    // coexist with an unfixable finding, so persist only the plugin's source.
    if (file.messages.some((message) => message.fatal && !message.ruleId))
      continue;
    await writeFile(resolve(file.cwd, file.path), String(file));
  }
}

export async function run(
  args: CliArguments,
  cwd: string,
  streams: Streams = {},
): Promise<number> {
  const { values, positionals } = args;
  const { code, context } = await execute({
    processor: () =>
      unified().use(remarkParse).use(recommended).use(slopstopper),
    cwd,
    files: positionals,
    extensions: ["md", "markdown", "mdown", "mkd", "mkdn"],
    rcName: ".remarkrc",
    packageField: "remarkConfig",
    pluginPrefix: "remark",
    ignoreName: ".remarkignore",
    ignorePath: values["ignore-path"],
    rcPath: values.config,
    detectConfig: !values["no-config"],
    filePath: values["stdin-filepath"],
    plugins: [[slopstopper as unknown as Plugin, pluginOptions(args)]],
    out: false,
    output: false,
    frail: true,
    ...streams,
    ...(values.json
      ? {
          reporter: jsonReporter,
          streamError: streams.streamOut ?? process.stdout,
        }
      : {}),
  });
  if (values.fix) await writeEdits(context);
  if (
    context.files.some((file) =>
      file.messages.some((message) => !message.ruleId),
    )
  )
    return 2;
  return code;
}
