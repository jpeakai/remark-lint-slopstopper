import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createDocument } from "../../src/document/context.ts";
import { fences } from "../../src/mermaid/markdown.ts";
import { factProblems, numbersOf } from "./facts.ts";
import { loadTranslations } from "./families.ts";

const examples = fileURLToPath(new URL("../", import.meta.url));
const translations = loadTranslations(await readFile(join(examples, "translations.yml"), "utf8"));
const names = (await readdir(examples)).filter((name) => /^\d{2,}-/.test(name)).sort();

async function diagrams(prefix: string) {
  const name = names.find((item) => item.startsWith(prefix)) ?? prefix;
  const read = async (file: string) =>
    fences(createDocument(await readFile(join(examples, name, file), "utf8"))).map((fence) => fence.value);

  return { name, original: (await read("diagram.md"))[0] ?? "", comparisons: await read("diagram-fixed.md") };
}

// The original's facts against a comparison edited by `change`.
async function tampered(prefix: string, change: (source: string) => string) {
  const { original, comparisons } = await diagrams(prefix);
  const edited = comparisons.map(change);

  assert.notDeepEqual(edited, comparisons, "the tamper must change the comparison");

  return factProblems(original, edited);
}

test("every same-family comparison keeps its original's facts", async () => {
  const problems: string[] = [];

  for (const name of names.filter((item) => !translations[item])) {
    const { original, comparisons } = await diagrams(name);

    problems.push(...(await factProblems(original, comparisons)).map((problem) => `${name}: ${problem}`));
  }

  assert.deepEqual(problems, []);
});

test("a lost label, relationship or number is reported", async () => {
  const label = await tampered("03-", (source) => source.replace("Unreadable label", "Unreadable caption"));
  const relationship = await tampered("09-", (source) => source.replace(/\n.*\|\|--o\{.*/, ""));
  const number = await tampered("22-", (source) => source.replace("{3,4,3,4}", "{3,4,3,5}"));

  assert.match(label.join("\n"), /labels missing: Unreadable label/);
  assert.match(relationship.join("\n"), /relationships missing/);
  assert.match(number.join("\n"), /numbers missing: 4/);
});

test("reordered sequence messages are reported", async () => {
  const problems = await tampered("07-", (source) => {
    const lines = source.split("\n");
    const messages = lines.flatMap((line, index) => (line.includes("->>") ? [index] : []));
    const [first, second] = messages;

    if (first !== undefined && second !== undefined) {
      [lines[first], lines[second]] = [lines[second] ?? "", lines[first] ?? ""];
    }

    return lines.join("\n");
  });

  assert.match(problems.join("\n"), /message order differs/);
});

test("a family without a graph keeps its structure and stays one diagram", async () => {
  const fewer = await tampered("21-", (source) => source.replace(/\n[^\n]*: \[0\.[0-9]+, ?0\.[0-9]+\][^\n]*/, ""));
  const { original, comparisons } = await diagrams("21-");

  assert.match(fewer.join("\n"), /nodes changed from 8 to 7/);
  assert.match((await factProblems(original, [...comparisons, ...comparisons])).join("\n"), /must stay one diagram/);
});

test("numbers come from the diagram body, not frontmatter, comments or colours", () => {
  const source = [
    "---",
    "config:",
    "  themeVariables:",
    "    fontSize: 16",
    "---",
    "%% 99 comments do not count",
    "pie title Orders in 2026",
    '  "Kept": 3',
    '  "Returned": 1.5',
    "  style A fill:#111111,stroke-width:4px",
  ].join("\n");

  assert.deepEqual(numbersOf(source), ["2026", "3", "1.5"]);
});
