// Checked access to Mermaid's internal databases. A dependency bump that
// renames a getter or changes a collection must fail loudly with what changed,
// never yield an empty structure that reads as a valid, simpler diagram.

export class IncompatibleMermaidShape extends Error {
  override name = "IncompatibleMermaidShape";
}

const describe = (value: unknown): string =>
  Array.isArray(value) ? "an array" : value === null ? "null" : typeof value;

const fail = (path: string, expected: string, value: unknown): never => {
  throw new IncompatibleMermaidShape(`Mermaid's ${path} is ${describe(value)}, expected ${expected}`);
};

// Call a database getter on its own database, so getters that use `this` work.
export function getter<T = unknown>(db: unknown, name: string): T {
  const method = typeof db === "object" && db !== null ? (db as Record<string, unknown>)[name] : undefined;

  if (typeof method !== "function") {
    return fail(`database ${name}`, "a getter", method);
  }

  return (method as (this: unknown) => T).call(db);
}

export function list<T = unknown>(value: unknown, path: string): T[] {
  return Array.isArray(value) ? (value as T[]) : fail(path, "an array", value);
}

// A getter that must return a collection.
export const listGetter = <T = unknown>(db: unknown, name: string): T[] => list<T>(getter(db, name), `${name}()`);

export function finite(value: unknown, path: string): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fail(path, "a finite number", value);
}

export function identifier(value: unknown, path: string): string {
  return typeof value === "string" && value !== "" ? value : fail(path, "a non-empty identifier", value);
}

export function flag(value: unknown, path: string): boolean {
  return typeof value === "boolean" ? value : fail(path, "a boolean", value);
}
