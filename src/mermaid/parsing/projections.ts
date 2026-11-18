import { parse } from "@mermaid-js/parser";
import { finite, identifier, list } from "../compat/shapes.ts";
import type { DomainName } from "../compat/types.ts";

// Projections of Mermaid's public grammar ASTs that stand in for its internal
// databases. Each applies the database's own semantics, so it reads the same
// facts without reaching into Mermaid's distribution.

export interface TreemapItem {
  name: string;
  value?: number;
  children: TreemapItem[];
}

interface TreemapRow {
  indent?: number;
  item?: { $type: string; name?: unknown; value?: unknown };
}

// The visible roots of a treemap, nested by indentation as the database nests
// them: a row belongs to the nearest earlier row indented less than it.
export async function treemapProjection(text: string): Promise<TreemapItem[]> {
  const ast = (await parse("treemap", text)) as unknown as { TreemapRows?: unknown };
  const roots: TreemapItem[] = [];
  const open: { indent: number; item: TreemapItem }[] = [];

  for (const row of list<TreemapRow>(ast.TreemapRows, "treemap rows")) {
    if (row.item) {
      nest(open, roots, row.indent ?? 0, treemapItem(row.item));
    }
  }

  return roots;
}

function treemapItem(row: NonNullable<TreemapRow["item"]>): TreemapItem {
  const name = identifier(row.name, "treemap item name");

  return row.$type === "Leaf"
    ? { name, value: finite(row.value, `treemap value of ${name}`), children: [] }
    : { name, children: [] };
}

// Close every open row indented as far or further, then nest under the rest.
function nest(open: { indent: number; item: TreemapItem }[], roots: TreemapItem[], indent: number, item: TreemapItem) {
  while (open.length && (open.at(-1)?.indent ?? 0) >= indent) {
    open.pop();
  }

  (open.at(-1)?.item.children ?? roots).push(item);
  open.push({ indent, item });
}

export interface CynefinView {
  getDomains(): Map<DomainName, { name: DomainName; items: { label: string }[] }>;
  getTransitions(): { from: DomainName; to: DomainName; label: string | undefined }[];
}

interface CynefinAst {
  domains?: unknown;
  transitions?: unknown;
}

// A cynefin diagram as its database holds it: a later block for a domain
// replaces an earlier one, self-loop transitions are skipped and an empty
// transition label is absent. Visible clipping stays with the renderer model.
export async function cynefinProjection(text: string): Promise<CynefinView> {
  const ast = (await parse("cynefin", text)) as unknown as CynefinAst;
  const domains = new Map<DomainName, { name: DomainName; items: { label: string }[] }>();

  for (const block of list<{ domain?: unknown; items?: unknown }>(ast.domains ?? [], "cynefin domains")) {
    const name = identifier(block.domain, "cynefin domain") as DomainName;
    const items = list<{ label?: unknown }>(block.items ?? [], `cynefin ${name} items`).map((item) => ({
      label: typeof item.label === "string" ? item.label : identifier(item.label, `cynefin ${name} item label`),
    }));

    domains.set(name, { name, items });
  }

  const transitions = list<{ from?: unknown; to?: unknown; label?: unknown }>(
    ast.transitions ?? [],
    "cynefin transitions",
  )
    .map((transition) => ({
      from: identifier(transition.from, "cynefin transition source") as DomainName,
      to: identifier(transition.to, "cynefin transition target") as DomainName,
      label: typeof transition.label === "string" && transition.label ? transition.label : undefined,
    }))
    .filter((transition) => transition.from !== transition.to);

  return { getDomains: () => domains, getTransitions: () => transitions };
}
