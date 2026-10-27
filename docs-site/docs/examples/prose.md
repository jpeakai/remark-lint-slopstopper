# Prose before and after

These examples show the source changes offered by the prose policies.
Enable `fix: true` using the [fix guide](../guides/fixes.md).

## Put each sentence on its own line

`sentence-one-per-line` changes layout while preserving the paragraph.

=== "Before"

    ```markdown
    The parser reads the file. The reporter prints a finding.
    ```

=== "After"

    ```markdown
    The parser reads the file.
    The reporter prints a finding.
    ```

A source newline keeps both sentences in the same rendered paragraph.
See [Sentence layout](../RULES.md#sentence-layout).

## Promote a comma-joined code run

`list-comma-code-run` recognises a run of inline code spans that closes its sentence.

=== "Before"

    ```markdown
    Stages: `parse`, `analyse`, `report`.
    ```

=== "After"

    ```markdown
    Stages:

    - `parse`
    - `analyse`
    - `report`
    ```

The List Promotion preserves each inline code item and drops the sentence's final full stop.
See [Comma-joined code run](../RULES.md#comma-joined-code-run).

## Promote a semicolon-delimited run

A colon supplies the lead-in for a supported semicolon list.

=== "Before"

    ```markdown
    A release needs: a signed tag; a changelog entry; and a green build.
    ```

=== "After"

    ```markdown
    A release needs:

    - a signed tag
    - a changelog entry
    - a green build
    ```

The joining conjunction is removed from the last item.
See [Semicolon-delimited run](../RULES.md#semicolon-delimited-run).

## Keep an ambiguous passage for review

The semicolon rule reports this input without offering a List Promotion:

```markdown
A release needs a signed tag; a changelog entry; a green build.
```

There is no colon to separate a lead-in from the first item.
Rewrite it manually before rechecking.

## Separate editing from rewriting

Sentence and paragraph budgets supply guidance rather than automatic rewrites.
A sentence can pass layout checks and still need shorter wording.
See [the budget rules](../RULES.md#sentence-word-budget) for examples.
