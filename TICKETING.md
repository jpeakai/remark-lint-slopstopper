# Ticketing

This repo uses GitHub Issues to track work items.
GitHub Issues may be shortened to 'GH Issues'.

## Who Am I

When working in a repo with multiple contributors, identity is important.

Look at the `git` config as well as the `gh` CLI to corroborate we are filtering to the right person.

```sh
git config user.name
git config user.email
gh api user --jq .login
```

## Backlog

Issues are subdivided into:
- Bugs
- Features

(Other categories may be added over time.)

Each issue title is prefixed with its category:
- `[bug]`, labelled `bug`
- `[feat]`, labelled `enhancement`

This categorisation helps prioritise which type of work to pick up next.

For this repo, the owner is `neozenith` and every ticket is assigned to them.

```sh
gh issue create --title "[feat] {title}" --label enhancement --assignee neozenith --body-file {body}
```

## Deduplication

Before creating an issue, search open and closed issues for the same work.

```sh
gh issue list --state all --search "{key words} in:title,body" --json number,title,state,createdAt --limit 50
```

The earliest issue is the **canonical** issue.
Every later issue for the same work is closed as a duplicate of it, never the other way round.

```sh
gh issue close {duplicate} --duplicate-of {canonical}
```

The canonical issue keeps a count of its duplicates in one tracking comment, edited in place rather than added to:

```
Duplicates: 2
- #31
- #35
```

Create the comment on the first duplicate, then edit it for each later one, increasing the count and adding the issue number.

When a duplicate sheds new light on the work, rewrite the canonical issue's title and body into a refined, updated version.
GH Issues keeps every edit of the body in its history, so nothing is lost.

```sh
gh issue edit {canonical} --title "{refined title}" --body-file {refined body}
```

Emoji reactions on the canonical issue are upvotes.
Anyone who hits the same need reacts with 👍 instead of filing a new issue.
An issue's **demand** is its duplicate count plus its total reactions.

## Relationships

Issues are linked with GH Issues `blocked by` / `blocking` relationships so the backlog forms a DAG of the work.

- An issue that cannot start until another is done is `blocked by` it.
- The graph must stay acyclic: before adding a link, check the blocker is not already (transitively) blocked by the issue.
- When creating an issue, ask whether it is blocked by or blocking any open issue, and link it then.

```sh
gh issue create ... --blocked-by 12,14 --blocking 20
gh issue edit 23 --add-blocked-by 12
gh issue edit 23 --remove-blocked-by 12
gh issue list --state open --json number,title,labels,blockedBy,blocking --limit 200
```

An issue is **ready** when every issue it is blocked by is CLOSED.

To choose the next piece of work, take the ready issues in dependency order (topological order of the DAG).
Among ready issues, prefer the one blocking the most open work, then `[bug]` before `[feat]`, then the highest demand, then the lowest issue number.

## Works In Progress (WIP)

Work in progress passes through these stages:
- feature branch (no PR yet)
- draft PR
- open PR

When work starts, the branch is named:
- bug: `fix/RLSS-{issue_number}-{4 words description in kebab-case}`
- feature: `feat/RLSS-{issue_number}-{4 words description in kebab-case}`

The PR title is named:
- bug: `[bug] RLSS-{issue_number} {4 words description}`
- feat: `[feat] RLSS-{issue_number} {4 words description}`

The PR body mentions the related GH Issue as `Closes #{issue_number}`.

Work on an open issue ideally happens in a new git worktree named `RLSS-{issue_number}-{4 words description in kebab-case}`.

Worktrees are sibling directories of the main checkout, never inside it.

```sh
git worktree add -b feat/RLSS-{issue_number}-{description} ../RLSS-{issue_number}-{description} main
```

## Completed Work

When a PR is MERGED, its branch is cleaned up.
When a PR is MERGED, the related GH Issue is CLOSED.

When a PR is CLOSED, its branch is cleaned up.
When a PR is CLOSED, the related GH Issue stays OPEN.

When an Issue is CLOSED, any related git worktrees can be cleaned up.
When an Issue is CLOSED, any related branches can be cleaned up.
