import { lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// Fixed input and owned output contracts for browser validation. Inputs are
// real example files inside examples/; outputs are fresh directories inside the
// project's own tmp/, and nothing on either path may be a filesystem link.

const EXAMPLE_FILES = ["diagram.md", "diagram-fixed.md"];

const inside = (parent: string, child: string): boolean => {
  const path = relative(parent, child);

  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
};

async function notLinked(path: string, what: string): Promise<void> {
  const found = await lstat(path).catch(() => null);

  if (found?.isSymbolicLink()) {
    throw new Error(`${what} is a filesystem link: ${path}`);
  }
}

// An example folder and its files, each a real entry inside examples/.
export async function canonicalExample(root: string, name: string): Promise<string> {
  if (!name || name === "." || name === ".." || /[/\\]/.test(name)) {
    throw new Error(`Expected an example folder name, not ${name}`);
  }

  const examples = await realpath(join(root, "examples"));
  const folder = join(examples, name);
  const found = await lstat(folder).catch(() => null);

  if (!found) {
    throw new Error(`Unknown example: ${name}`);
  }

  await notLinked(folder, `Example ${name}`);

  if (!found.isDirectory()) {
    throw new Error(`Unknown example: ${name}`);
  }

  for (const file of EXAMPLE_FILES) {
    await checkExampleFile(folder, `${name}/${file}`, join(folder, file));
  }

  return folder;
}

// A present example file must be a regular file that resolves inside its folder.
async function checkExampleFile(folder: string, label: string, path: string): Promise<void> {
  const entry = await lstat(path).catch(() => null);

  await notLinked(path, `Example file ${label}`);

  if (!entry) {
    return;
  }

  if (!entry.isFile()) {
    throw new Error(`Example file ${label} is not a regular file`);
  }

  if (!inside(folder, await realpath(path))) {
    throw new Error(`Example file ${label} resolves outside its folder`);
  }
}

// Every existing component from the project's tmp/ down to `path` must be a
// real directory, so no link can redirect the output.
async function realComponents(owned: string, path: string): Promise<void> {
  const parts = relative(owned, path).split(sep);
  let at = owned;

  for (const part of parts.slice(0, -1)) {
    at = join(at, part);
    await notLinked(at, "Output path component");
  }
}

// A fresh output directory inside the project's tmp/, created exclusively so
// an existing path can neither redirect nor overwrite evidence.
export async function ownedOutput(root: string, out: string): Promise<string> {
  await mkdir(join(root, "tmp"), { recursive: true });
  await notLinked(join(root, "tmp"), "The project tmp/ directory");

  const owned = await realpath(join(root, "tmp"));
  const target = resolve(out);
  const lexical = resolve(join(root, "tmp"));
  const relativeTo = inside(lexical, target) ? lexical : inside(owned, target) ? owned : null;

  if (!relativeTo) {
    throw new Error(`Output must be inside the project's tmp/ directory: ${out}`);
  }

  const path = join(owned, relative(relativeTo, target));

  await realComponents(owned, path);
  await mkdir(dirname(path), { recursive: true });
  await realComponents(owned, path);

  try {
    await mkdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Output already exists; choose a new directory: ${out}`);
    }

    throw error;
  }

  return path;
}

// Whether a path not yet created would be owned output: inside the project's
// tmp/ with no linked component. Checked before anything is reset or launched.
export async function assertOwnedLocation(root: string, path: string): Promise<void> {
  const lexical = resolve(join(root, "tmp"));
  const target = resolve(path);

  if (!inside(lexical, target)) {
    throw new Error(`Output must be inside the project's tmp/ directory: ${path}`);
  }

  await notLinked(lexical, "The project tmp/ directory");
  await realComponents(lexical, target);
}
