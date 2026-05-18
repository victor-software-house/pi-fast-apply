---
name: codebase-search
description: Guidance for effective codebase_search queries — when to use vs grep/find, how to narrow with includes/excludes/searchType, node_modules mode, timing expectations.
---

# codebase_search guidance

## When to use

| Use `codebase_search` | Use `grep` / `find` instead |
|:--|:--|
| "Where is authentication handled?" | `grep -r "authenticate(" src/` |
| "How does the retry logic work?" | `grep -r "retry" --include="*.ts"` |
| "Find where database connections are pooled" | `find . -name "db.ts"` |
| "What calls the payment webhook?" | exact symbol name → grep |

`codebase_search` runs a multi-turn Morph WarpGrep search (6–14s). Use it for semantic/exploratory questions. Exact lookups are faster and free with grep/find.

## Narrowing parameters

All optional. Omit when searching the full workspace.

**`includes`** — restrict to matching paths:
```
includes: ["src/**/*.ts", "lib/**/*.ts"]
```

**`excludes`** — remove paths (replaces SDK defaults entirely when set):
```
excludes: ["dist", "*.test.ts", "**/__mocks__/**"]
```

**`searchType: "node_modules"`** — include normally-excluded dependency directories:
```
searchType: node_modules
repoRoot: ./packages/core
```
Auto-enabled when `repoRoot` is itself inside a `node_modules` path.

**`repoRoot`** — narrow to a workspace subdirectory:
```
repoRoot: packages/api
searchTerm: Find where request validation middleware is applied
```

## Timing expectations

- Typical: 6–10s wall time
- Cold start: up to 15s
- Local provider (ripgrep) contributes ~1s; the rest is Morph API turns
- Fewer turns = faster; a specific `searchTerm` reduces turns

## Redaction

Content from files is redacted with Secretlint by default. To disable for synthetic fixture debugging only:

```
CODEBASE_SEARCH_REDACTION=0
```

Search-term preflight (TruffleHog-derived) remains always on.
