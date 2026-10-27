# Apply verified fixes

Enable `fix: true` to apply verified prose edits.
Review the diff and run another check before accepting the result.

## Enable edit mode

Add `fix` beside your shared `options` and `rules`:

```js
import slopstopper from "@jpeakai/remark-lint-slopstopper/remark";

export default {
  plugins: [[slopstopper, { fix: true }]]
};
```

With that config in `.remarkrc.mjs`, write edits to your files:

```sh
bunx --bun remark-cli --output --frail docs/
git diff -- docs/
```

The plugin applies edits to the VFile source.
The CLI's `--output` flag writes that source to disk.

## Know which findings can change source

| Finding | Automatic change |
| --- | --- |
| Sentence layout | Verified whitespace edits |
| A supported hidden list | A List Promotion with the declared list structure |
| Unambiguous punctuation | A verified glyph swap |
| Sentence or paragraph budget | Guidance for a manual rewrite |
| Mermaid contrast or complexity | Guidance for a manual diagram change |

Every edit is reparsed before a finding can expose it.
A layout edit keeps the tree after whitespace normalisation.
A glyph swap keeps the shape and visible words.
A List Promotion changes only the declared paragraph into its lead-in and list.

## Understand the order of edits

The adapter applies one policy's visible edits per round.
List Promotions run before punctuation swaps, and sentence layout runs last.
The adapter reparses and reports again after each round.

This order preserves separators that a List Promotion needs.
Native suppression excludes an edit before any round applies it.
The plugin splices source ranges rather than serialising the whole document.

## Handle a refused edit

A finding can remain without an automatic edit when its structure is ambiguous.
Rewrite that passage manually, then rerun the check.
Blockquotes and explicit hard breaks restrict layout and List Promotion edits.

Keep `fix: true` for an idempotence check:

```sh
bunx --bun remark-cli --output --frail docs/
git diff -- docs/
```

A settled source produces no further edits.
Remaining findings can still make the command fail.
Consult [worked examples](../examples/prose.md) for supported input shapes.
