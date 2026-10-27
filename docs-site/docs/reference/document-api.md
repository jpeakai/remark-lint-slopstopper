# Document API

The `@jpeakai/remark-lint-slopstopper/document` entry point exports `createDocument` and its context types.
A Document Context shares source projections and lazy language analysis between policies.

## Create a Document Context

```ts
import { createDocument } from "@jpeakai/remark-lint-slopstopper/document";

const document = createDocument("The parser validates requests.");
const paragraph = document.paragraphs[0];
if (!paragraph) throw new Error("Expected a paragraph");

const projection = document.projection(paragraph.node);
const view = document.language(paragraph.node);
const sentences = await view.sentences;
```

Pass `{tree, cwd}` as the second argument when a host already has a parsed tree or a project vocabulary directory.
The supplied tree preserves host transformations.
Without `cwd`, vocabulary lookup uses the process working directory.

## Document Context members

| Member | Contract |
| --- | --- |
| `source` | Original Markdown string |
| `tree` | Supplied or parsed mdast root |
| `paragraphs` | Paragraph nodes paired with their ancestors |
| `textNodes` | Text nodes, including heading and table text |
| `eol` | The document's line ending |
| `projection(node)` | Rendered text with source offset maps |
| `language(node)` | A shared lazy LanguageView for a paragraph or text node |
| `safeEdit(edit, expectation?)` | Verify an edit against its declared change |
| `validateBatch(diagnostics)` | Verify a policy's proposed edits together |

The remark adapter attaches each view at `node.data.language`.
Reading text alone does not trigger NLP.

## Language view and sentence members

The `@jpeakai/remark-lint-slopstopper/language-view` entry point exports the view and sentence types.

| Member | Meaning |
| --- | --- |
| `view.text` | Projected text without requesting language analysis |
| `view.requested` | Whether sentence analysis has been requested |
| `view.sentences` | One memoised Promise of sentence models |
| `sentence.start`, `sentence.end` | UTF-16 offsets within projected text |
| `sentence.wordCount` | Visible words counted by the language model |
| `sentence.terms` | Normalised lexical content terms |
| `sentence.clauses` | An estimated clause count |
| `sentence.opener`, `sentence.refersBack` | Lexical grouping signals |

Sentence models guide policies without guaranteeing semantic topic boundaries.

## Map a sentence to original source

Use the projection's maps rather than adding a paragraph offset:

```ts
const sentence = sentences[0];
if (!sentence) throw new Error("Expected a sentence");
const start = projection.offsets[sentence.start];
const end = projection.endOffsets[sentence.end - 1];
```

Entities, escapes, links and inline formatting change the mapping.
Inline code projects as `CODE`.
Offsets use UTF-16 code units rather than byte positions.

See [Contributing](../CONTRIBUTING.md#reuse-the-document-model) for policy authoring and [vocabulary](../guides/vocabulary.md) for Concepts Files.
