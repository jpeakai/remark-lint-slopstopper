import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Lexicon } from "compromise/misc";
import type { Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse).use(remarkGfm);

function textOf(node: Nodes): string {
  if (node.type === "text" || node.type === "inlineCode") {
    return node.value;
  }

  return "children" in node ? node.children.map(textOf).join("") : "";
}

function headingTerms(tree: Root): string[] {
  return tree.children.flatMap((node, index) =>
    node.type === "heading" && node.depth > 1 && tree.children[index + 1]?.type === "paragraph" ? [textOf(node)] : [],
  );
}

async function conceptsSource(cwd: string): Promise<string> {
  try {
    return await readFile(resolve(cwd, "CONCEPTS.md"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

/** One lazy vocabulary snapshot per context, never a process-global NLP mutation. */
export function conceptVocabulary(cwd: string): () => Promise<Lexicon> {
  let pending: Promise<Lexicon> | undefined;

  return () => {
    pending ??= conceptsSource(cwd).then((source) => {
      const tree = parser.parse(source);
      const terms = headingTerms(tree)
        .map((term) => term.trim().replace(/\s+/g, " ").toLowerCase())
        .filter(Boolean);

      return Object.fromEntries(terms.map((term) => [term, "Noun"]));
    });

    return pending;
  };
}
