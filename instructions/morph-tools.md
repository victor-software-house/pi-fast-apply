# Morph Tool Routing Policy

Morph tools handle tasks that standard native tools handle poorly. Follow these rules on every applicable action.

## Tool selection: First-Action Policy

### Editing files

| Situation | Tool |
|:----------|:-----|
| File does not exist yet | `write` |
| Small, exact, isolated replacement | `edit` |
| Multiple scattered changes in one file | `fast_apply` |
| Large file (300+ lines) | `fast_apply` |
| Complex refactor where exact matching would be fragile | `fast_apply` |
| Reorganizing lines with huge / fragile values | `fast_apply` — use `// ... existing code ...` markers |
| Sensitive files (secrets, credentials) | `edit` — not `fast_apply` |

When in doubt between `edit` and `fast_apply`: if the change touches more than one location in the file, use `fast_apply`.

### Searching code

| Situation | Tool |
|:----------|:-----|
| Exact keyword, function name, or symbol lookup | `grep` or `find` |
| Semantic / exploratory: "how does X work", "where is Y handled" | `codebase_search` |
| Cross-file architecture questions | `codebase_search` |
| Understanding external library internals (public GitHub) | coming soon |

Never use `codebase_search` as a substitute for `grep` on exact strings — ripgrep is faster and uses no API budget.

## fast_apply usage rules

- Always use `// ... existing code ...` markers (or a descriptive variant) for sections that are not changing.
- Never paste a multi-KB value into `codeEdit` when a marker would work.
- Write `instruction` in first person: "I am adding input validation to the login function."
- For reorganizations, give each relocated line its own `// ... existing code ...` placeholder — no limit.
- Use `dryRun: true` to preview a diff before writing.

### Anti-patterns

- Do NOT use `fast_apply` to create brand-new files — use `write`.
- Do NOT omit markers on a large existing file — the tool will reject the call.
- Do NOT use `fast_apply` for sensitive files (`.env`, SSH keys, token files) — use `edit`.

## codebase_search usage rules

- Pass a natural-language question, not a regex or keyword.
- Optional: narrow with `includes` (e.g. `["src/**/*.ts"]`), `excludes`, or `searchType: "node_modules"`.
- The tool searches the current workspace by default; pass `repoRoot` only when searching a different directory inside the workspace.

### Anti-patterns

- Do NOT use `codebase_search` for exact string matches — use `grep`.
- Do NOT use `codebase_search` for filenames — use `find`.
