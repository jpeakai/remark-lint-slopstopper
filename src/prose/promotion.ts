import {
  type DocumentContext,
  type ParagraphContext,
  runningProse,
  unsafeLayout,
} from "../document/context.ts";
import type { DeclaredEdit } from "../document/edits.ts";
import { collapse, type Range, spansBetween } from "../document/ranges.ts";
import {
  proseSentences,
  type SourceParagraph,
  sourceParagraph,
} from "../document/source-text.ts";
import type { Diagnostic, PolicyRuleId, RuleOptions } from "../types.ts";

// List Promotion: the shared edit of every hidden-list policy. Sentences that
// string items together inline become a lead-in line and a real Markdown
// list. Item text is sliced from the source, never reserialised, so links,
// emphasis, escapes and code spans travel unchanged.

export interface PromotedItem {
  text: string;
  children?: string[];
}

export interface Promotion {
  source: string;
  paragraph: SourceParagraph;
  span: Range;
  leadIn: string | null;
  items: PromotedItem[];
  ordered: boolean;
}

// A list run policy's item threshold, read the same way by its check and its
// edit so the two never disagree about how long a run must be.
export const minItemsOf = (options: RuleOptions, fallback: number): number => {
  const value = options.minItems ?? fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 2)
    throw new RangeError("minItems must be a whole number of at least 2");
  return value;
};

// A line that would parse as something other than paragraph text when it
// starts a list item: a heading, quote, nested bullet, ordered marker,
// fence, thematic break, table pipe or raw HTML.
const UNSAFE_START =
  /^(?:[-+*](?:\s|$)|#{1,6}(?:\s|$)|>|\d{1,9}[.)](?:\s|$)|`{3}|~{3}|<|\||[-_*=](?:\s*[-_*=]){2,}\s*$)/;
const CONJUNCTION_HEAD = /^(?:and|or)\s+/i;
const CONJUNCTION_TAIL = /\s+(?:and|or)$/i;

// "b, and" sheds the comma and the conjunction in either order. Only the
// last item may open with the joining conjunction or drop a full stop.
const cleanItem = (raw: string, isLast: boolean): string => {
  let text = collapse(raw).trim();
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(/[;,]+$/, "").trim();
    text = text.replace(CONJUNCTION_TAIL, "").trim();
    if (isLast) text = text.replace(CONJUNCTION_HEAD, "").trim();
  }
  return isLast ? text.replace(/(?<!\.)\.$/, "").trim() : text;
};

// Source spans in document order, as cleaned item text.
export const itemsOf = (source: string, spans: readonly Range[]): string[] =>
  spans.map((span, i) =>
    cleanItem(source.slice(span[0], span[1]), i + 1 === spans.length),
  );

// The items between a run of cut points, as cleaned text.
export const itemsBetween = (
  source: string,
  cuts: readonly Range[],
  end: number,
): string[] => itemsOf(source, spansBetween(cuts, end));

export const cleanLeadIn = (raw: string): string | null => {
  const text = collapse(raw)
    .trim()
    .replace(/[\s:;,—-]+$/, "")
    .trim();
  return text.length > 0 ? `${text}:` : null;
};

const dedent = (raw: string, indent: string): string =>
  raw
    .split("\n")
    .map((line, i) =>
      i > 0 && line.startsWith(indent)
        ? line.slice(indent.length)
        : line.trimStart(),
    )
    .join("\n");

const listOf = ({ items, ordered }: Promotion): string =>
  items
    .map((item, i) => {
      const marker = ordered ? `${i + 1}. ` : "- ";
      const pad = " ".repeat(marker.length);
      return [
        `${marker}${item.text}`,
        ...(item.children ?? []).map((child) => `${pad}- ${child}`),
      ].join("\n");
    })
    .join("\n");

const promotable = (p: Promotion): boolean => {
  const texts = [
    ...p.items.flatMap((item) => [item.text, ...(item.children ?? [])]),
    ...(p.leadIn ? [p.leadIn] : []),
  ];
  return (
    runningProse(p.paragraph.context) &&
    !unsafeLayout(p.paragraph.context) &&
    p.items.length >= 2 &&
    texts.every((text) => text.length > 0 && !UNSAFE_START.test(text))
  );
};

// Inside a list item a blank line would loosen the parent list, and text
// after the nested list would become lazy continuation, so only a lead-in
// followed by the list is promotable there.
const fragmentOf = (p: Promotion): string | null => {
  const { paragraph, source, span } = p;
  const before = dedent(
    source.slice(paragraph.start, span[0]),
    paragraph.indent,
  ).trim();
  const after = dedent(
    source.slice(span[1], paragraph.end),
    paragraph.indent,
  ).trim();
  const head = [before, p.leadIn ?? ""].filter(Boolean).join("\n");
  const nested = paragraph.context.ancestors.some(
    (ancestor) => ancestor.type === "listItem",
  );
  if (!nested) return [head, listOf(p), after].filter(Boolean).join("\n\n");
  return head && !after ? `${head}\n${listOf(p)}` : null;
};

export const promote = (p: Promotion): DeclaredEdit | null => {
  if (!promotable(p)) return null;
  const fragment = fragmentOf(p);
  if (fragment === null) return null;
  const text = fragment
    .split("\n")
    .map((line, i) => (i === 0 || !line ? line : p.paragraph.indent + line))
    .join("\n");
  return {
    edit: { start: p.paragraph.start, end: p.paragraph.end, text },
    expect: {
      kind: "replace-paragraph",
      paragraph: p.paragraph.context.node,
      fragment,
      listItems: p.items.length,
    },
  };
};

// A paragraph's findings for one policy, with its verified promotion carried
// by the first. No finding means no edit is offered.
export const withPromotion = (
  document: DocumentContext,
  findings: Diagnostic[],
  promotion: DeclaredEdit | null,
): Diagnostic[] => {
  const [head] = findings;
  if (head && promotion && document.safeEdit(promotion.edit, promotion.expect))
    head.fix = promotion.edit;
  return findings;
};

// A finding over a paragraph range, the shape every run policy reports.
export const runFinding = (
  ruleId: PolicyRuleId,
  range: Range,
  message: string,
): Diagnostic => ({ ruleId, start: range[0], end: range[1], message });

// A policy that counts the items of a run in each sentence and promotes the
// first run its edit can trust.
export interface SentenceRunPolicy {
  ruleId: PolicyRuleId;
  defaultMinItems: number;
  items: (sentence: string) => number;
  message: (items: number) => string;
  promotion: (
    source: string,
    paragraph: SourceParagraph,
    minItems: number,
  ) => DeclaredEdit | null;
}

export const sentenceRunCheck =
  (policy: SentenceRunPolicy) =>
  async (
    document: DocumentContext,
    paragraph: ParagraphContext,
    options: RuleOptions,
  ): Promise<Diagnostic[]> => {
    const minItems = minItemsOf(options, policy.defaultMinItems);
    const findings = (await proseSentences(document, paragraph)).flatMap(
      ({ text, range }) => {
        const items = policy.items(text);
        return items < minItems
          ? []
          : [runFinding(policy.ruleId, range, policy.message(items))];
      },
    );
    if (!findings.length) return findings;
    const { source } = document;
    return withPromotion(
      document,
      findings,
      policy.promotion(source, sourceParagraph(source, paragraph), minItems),
    );
  };
