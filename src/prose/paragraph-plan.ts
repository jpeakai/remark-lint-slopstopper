import type { LanguageSentence } from "../document/language-view.ts";

const shared = (a: Set<string>, b: Set<string>): number => [...a].filter((term) => b.has(term)).length;

function cohesion(sentences: readonly LanguageSentence[], next: LanguageSentence, i: number): number {
  const current = sentences[i];

  if (!current) {
    return 0;
  }

  const pairs: number[] = [];
  const before = sentences[i - 1];
  const after = sentences[i + 2];

  if (before) {
    pairs.push(shared(before.terms, next.terms));
  }

  if (after) {
    pairs.push(shared(current.terms, after.terms));
  }

  const surrounding = pairs.length ? (2 * pairs.reduce((a, b) => a + b, 0)) / pairs.length : 0;
  const opener = next.opener && next.opener === current.opener ? 1 : 0;

  return 2 * shared(current.terms, next.terms) + surrounding + (next.refersBack ? 2 : 0) + opener;
}

function preferredBreak(scores: number[], at: number, best: number, bounds: [number, number]): boolean {
  const [from, to] = bounds;
  const score = scores[at - 1] ?? 0;
  const prior = scores[best - 1] ?? 0;

  return score < prior || (score === prior && Math.abs(2 * at - from - to) < Math.abs(2 * best - from - to));
}

function splitGroup(state: { scores: number[]; breaks: Set<number>; budget: number }, from: number, to: number): void {
  const { scores, breaks, budget } = state;

  if (to - from <= budget) {
    return;
  }

  let best = from + 1;

  for (let at = best + 1; at < to; at++) {
    if (preferredBreak(scores, at, best, [from, to])) {
      best = at;
    }
  }

  breaks.add(best);
  splitGroup(state, from, best);
  splitGroup(state, best, to);
}

export function paragraphPlan(
  sentences: readonly LanguageSentence[],
  budget: number,
): { topics: number; breaks: number[] } {
  const scores = sentences.slice(1).map((next, i) => cohesion(sentences, next, i));
  const topicBreaks = scores.flatMap((score, i) => (score === 0 ? [i + 1] : []));
  const breaks = new Set(topicBreaks);
  const edges = [0, ...topicBreaks, sentences.length];

  for (let i = 0; i < edges.length - 1; i++) {
    splitGroup({ scores, breaks, budget }, edges[i] ?? 0, edges[i + 1] ?? sentences.length);
  }

  return {
    topics: topicBreaks.length + 1,
    breaks: [...breaks].sort((a, b) => a - b),
  };
}
