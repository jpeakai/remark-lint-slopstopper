# Teach project vocabulary

Use a Concepts File to identify domain phrases as nouns during prose analysis.
This lexical guidance does not enforce terminology or change word budgets.

## Define terms in the working directory

Create `CONCEPTS.md` in the remark VFile's working directory:

```markdown
## Work Bundle

A durable group of related tasks.

## Dispatch Record

A recorded handoff between workers.
```

Use a level-two or deeper heading immediately followed by a paragraph.
Define an alias as a separate heading entry.
Tables and list-only definitions are not extracted.

## Keep definitions local

The plugin uses `VFile.cwd`.
A direct `createDocument(source, {cwd})` call uses its supplied directory, or the process working directory by default.
There is no ancestor-directory search.

The first sentence request loads one vocabulary snapshot per Document Context.
A fresh context can observe a changed Concepts File.
Missing files are optional, while other read errors remain visible.

## Understand what reaches the analyser

Only heading terms are imported.
Definitions and fenced examples are excluded.
Compromise tags literal matching phrases as nouns without changing shared global vocabulary.
Each visible word still counts towards a sentence budget.

See the [Document API](../reference/document-api.md) to supply `cwd` from a library caller.
