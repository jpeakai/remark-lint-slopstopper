import { type DocumentContext, endOf, type Leaf, type ParagraphContext, unsafeLayout } from "../../document/context.ts";
import { interpunctRun, isStacked } from "../../document/interpunct-runs.ts";
import type { Diagnostic } from "../../types.ts";

interface Layout {
  boundaries: Set<number | undefined>;
  unsafe: boolean;
  indent: string;
}

function gapFinding(
  document: DocumentContext,
  gap: {
    start: number;
    end: number;
    boundary: boolean;
    replacement: string;
    unsafe: boolean;
  },
): Diagnostic {
  const { start, end, boundary, replacement, unsafe } = gap;
  const finding: Diagnostic = {
    ruleId: "prose/sentence-one-per-line",
    start,
    end,
    message: boundary
      ? "Several sentences share one line; put each sentence on its own line without changing words."
      : "A line break interrupts a sentence; join this soft wrap so each sentence occupies one line.",
  };
  const edit = { start, end, text: replacement };

  if (!unsafe && document.safeEdit(edit)) {
    finding.fix = edit;
  }

  return finding;
}

function leafFindings(document: DocumentContext, leaf: Leaf, { boundaries, unsafe, indent }: Layout): Diagnostic[] {
  const findings: Diagnostic[] = [];

  for (const match of leaf.value.matchAll(/\s+/g)) {
    const start = leaf.start + match.index;
    const boundary = boundaries.has(start);

    if (boundary === /[\r\n]/.test(match[0])) {
      continue;
    }

    findings.push(
      gapFinding(document, {
        start,
        end: start + match[0].length,
        boundary,
        replacement: boundary ? document.eol + indent : " ",
        unsafe,
      }),
    );
  }

  return findings;
}

function entityFindings(
  document: DocumentContext,
  paragraph: ParagraphContext,
  boundaries: Layout["boundaries"],
): Diagnostic[] {
  const findings: Diagnostic[] = [];

  for (const at of boundaries) {
    if (at === undefined || document.source[at] !== "&") {
      continue;
    }

    findings.push({
      ruleId: "prose/sentence-one-per-line",
      start: at,
      end: Math.min(endOf(paragraph.node), document.source.indexOf(";", at) + 1 || at + 1),
      message:
        "Several sentences share one line through an encoded space; put each sentence on its own line. Review this entity manually to preserve its intended spacing.",
    });
  }

  return findings;
}

export async function checkSentenceOnePerLine(
  document: DocumentContext,
  paragraph: ParagraphContext,
): Promise<Diagnostic[]> {
  const { node } = paragraph;
  const view = document.projection(node);
  const sentences = await document.language(node).sentences;
  const layout: Layout = {
    boundaries: new Set(sentences.slice(1).map((sentence) => view.offsets[sentence.start - 1])),

    // Interpunct runs stacked on several lines are a nested list; joining
    // the lines would destroy that structure, so they are never reflowed.
    unsafe: unsafeLayout(paragraph) || interpunctRun(document, paragraph).some(isStacked),
    indent: " ".repeat((node.position?.start.column ?? 1) - 1),
  };

  return [
    ...view.leaves.flatMap((leaf) => leafFindings(document, leaf, layout)),
    ...entityFindings(document, paragraph, layout.boundaries),
  ];
}
