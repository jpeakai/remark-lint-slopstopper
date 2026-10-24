import type { Lexicon, Term } from "compromise/misc";

// Official compute("root") adds a lemma, omitted by Compromise's Term declaration.
declare module "compromise/misc" {
  interface Term {
    root?: string;
  }
}

export interface LanguageSentence {
  text: string;
  start: number;
  end: number;
  wordCount: number;
  clauses: number;
  terms: Set<string>;
  opener: string | null;
  refersBack: boolean;
}

export interface LanguageView {
  readonly text: string;
  readonly requested: boolean;
  readonly sentences: Promise<readonly LanguageSentence[]>;
}

export function createLanguageView(
  text: () => string,
  analyze: (
    source: string,
    lexicon: Lexicon,
  ) => Promise<readonly LanguageSentence[]> = language,
  vocabulary: () => Promise<Lexicon> = () => Promise.resolve({}),
): LanguageView {
  let pending: Promise<readonly LanguageSentence[]> | undefined;
  const view: LanguageView = {
    get text() {
      return text();
    },
    get requested() {
      return pending !== undefined;
    },
    get sentences() {
      pending ??= vocabulary().then((lexicon) => analyze(text(), lexicon));
      return pending;
    },
  };
  // AST inspection must not accidentally trigger asynchronous language work.
  Object.defineProperty(view, "sentences", { enumerable: false });
  return view;
}

const CLAUSES =
  /[;:](?=\s+\S)|,\s+(?:and|but|or|so|yet|nor)\b|\b(?:because|although|though|whereas|unless|whenever|wherever|while|when|if|which|who|whom|whose)\b/gi;
const CONTENT = new Set(["Noun", "Verb", "Adjective"]);
const FUNCTION = new Set([
  "Pronoun",
  "Possessive",
  "Auxiliary",
  "Copula",
  "Modal",
  "Determiner",
]);
const BACK_REFERENCE = new Set([
  "Pronoun",
  "Possessive",
  "Adverb",
  "Conjunction",
]);
const termRoot = (word: Term): string => word.root || word.normal;
const isContent = (word: Term): boolean =>
  word.text !== "CODE" &&
  [...(word.tags ?? [])].some((tag) => CONTENT.has(tag)) &&
  ![...(word.tags ?? [])].some((tag) => FUNCTION.has(tag));
function sentenceModel(
  nlp: typeof import("compromise").default,
  value: string,
  start: number,
  lexicon: Lexicon,
): LanguageSentence {
  const doc = nlp(value);
  doc
    .match(
      "(#Determiner|#Adjective|#Value) [(#PastTense|#Participle)] #Noun",
      0,
    )
    .tag("Adjective");
  // nlp(text, lexicon) calls global addWords. Tag this document's known
  // domain phrases instead, using the official literal lookup API.
  doc.lookup(Object.keys(lexicon)).tag("Noun", "project-concepts");
  doc.compute("root");
  const words = doc.termList();
  const content = words.filter(isContent);
  const first = words[0];
  return {
    text: value,
    start,
    end: start + value.length,
    wordCount: value.split(/\s+/).filter(Boolean).length,
    clauses: Math.max(
      1 + [...value.matchAll(CLAUSES)].length,
      doc.verbs().length,
    ),
    terms: new Set(content.map((word) => termRoot(word).toLowerCase())),
    opener: first && content[0] === first ? termRoot(first) : null,
    refersBack: [...(first?.tags ?? [])].some((tag) => BACK_REFERENCE.has(tag)),
  };
}
async function language(
  text: string,
  lexicon: Lexicon,
): Promise<readonly LanguageSentence[]> {
  const nlp = (await import("compromise")).default;
  let cursor = 0;
  // Quoted utterances can be grouped with the following sentence by compromise.
  const rawLanguageSentences = nlp(text).sentences().out("array") as string[];
  return rawLanguageSentences
    .flatMap((raw) => raw.split(/(?<=[.!?]["”’'])\s+(?=[A-Z])/u))
    .map((raw) => {
      const value = raw.trim();
      const start = text.indexOf(value, cursor);
      if (start < 0)
        throw new Error("Cannot map compromise sentence back to prose");
      cursor = start + value.length;
      return sentenceModel(nlp, value, start, lexicon);
    })
    .filter((sentence) => sentence.text);
}
