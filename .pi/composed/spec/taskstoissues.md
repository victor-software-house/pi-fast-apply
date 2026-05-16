---
description: Convert existing tasks into actionable, dependency-ordered GitHub issues for the feature based on available design artifacts.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from repo root and parse FEATURE_DIR and AVAILABLE_DOCS list. All paths must be absolute. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").
1. From the executed script, extract the path to **tasks**.
1. Get the Git remote by running:

```bash
git config --get remote.origin.url
```

> [!CAUTION]
> ONLY PROCEED TO NEXT STEPS IF THE REMOTE IS A GITHUB URL

1. For each task in the list, create a GitHub issue for the repository matching the Git remote.

   Determine the target repository:
   ```bash
   gh repo view --json nameWithOwner -q .nameWithOwner
   ```

   Create each issue:
   ```bash
   gh issue create \
     -R <owner>/<repo> \
     --title "<task title>" \
     --body "<task description>"
   ```

   Optional flags per issue:
   - `--label "bug,enhancement"` or `--label bug --label enhancement` — add labels by name
   - `--assignee @me` or `--assignee <login>` — assign to a user
   - `--milestone "v1.0"` — add to a milestone by name
   - `--project "Roadmap"` — add to a GitHub Project by title

   Set labels when the task has priority or category markers. Map task priorities to label names consistently.

> [!CAUTION]
> UNDER NO CIRCUMSTANCES EVER CREATE ISSUES IN REPOSITORIES THAT DO NOT MATCH THE REMOTE URL

## Next step

After issues are created, report the issue URLs and suggest: check the GitHub Issues tab to verify. Work is now tracked externally.
