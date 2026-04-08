# pi-fast-apply

Pi package repo for Morph-native integration work.

## Orient quickly

Read these files in order before changing behavior:

1. [`README.md`](README.md) — package purpose, package shape, development flow
2. [`ROADMAP.md`](ROADMAP.md) — ordered work items and acceptance criteria
3. [`extensions/index.ts`](extensions/index.ts) — current runtime truth
4. [`package.json`](package.json), [`biome.json`](biome.json), [`tsconfig.json`](tsconfig.json), [`lefthook.yml`](lefthook.yml) — package metadata, lint/type rules, hooks, and release flow
5. [`assets/README.md`](assets/README.md) — preview-image expectations for `pi.image`

## Repo shape

- `extensions/` — Pi extension entrypoints
- `assets/` — screenshots and preview imagery for pi.dev metadata
- root docs — package overview, roadmap, and agent-operational guidance
- no generated runtime state should be committed

## Tool routing guidance

This package registers two Morph-powered tools. Correct routing is critical — the model must pick the right tool for the task.

- **Fast Apply (`fast_apply`):** Use for scattered or fragile edits in existing files. Use `edit` for small exact replacements and `write` for new files.
- **Codebase Search (`codebase_search`):** Use at the start of codebase explorations for broad semantic queries like "Find the authentication flow". Input is plain English, not regex. Use native `grep` for exact keyword or regex matches.

## Working rules

- Keep the package Pi-native first. Do not default to MCP when the package can use Pi's runtime primitives directly.
- Keep implementation claims grounded in committed code.
- Prefer the smallest extension surface that proves the package direction.
- When adding Morph-backed behavior, preserve Pi ownership of path resolution, queueing, write timing, and operator-visible output.
- Ask before changing release flow, package name, npm publishing shape, or repository visibility.

## Auto-fix rules

Run these from the repo root:

```bash
bun run fix
bun run format
```

Use auto-fix before making manual style-only edits.

## Verification

Required gate before committing:

```bash
bun run typecheck
bun run lint
```

Also run:

```bash
bun install
```

when dependencies, hooks, or release tooling change.

## Import rules

- TypeScript is strict. Fix type errors rather than weakening config.
- Use single quotes for imports.
- Omit `.ts` and `.js` extensions in import paths.
- Use `import type` for type-only imports.
- Do not import hidden Pi internals from non-public paths.

## Git workflow

- Use Conventional Commits.
- Keep commits small and reviewable.
- Keep `lefthook` protections working unless the user explicitly requests otherwise.
- Releases publish from `main` through changesets. A release PR is created automatically; publishing happens only when the release PR is merged.

## Version bump discipline

**npm versions are permanent. Under-bump is recoverable; over-bump is not.**

Changesets maps commit types to version bumps:

| Commit type | Bump | When to use |
|:------------|:-----|:------------|
| `feat:` | minor | New tool, new command, new auth path — a capability Pi users did not have before |
| `fix:` | patch | Bug fix or behavioral correction in an existing tool |
| `refactor:` | none | Internal restructure with no user-visible change |
| `docs:` | none | README, ROADMAP, AGENTS.md, comments |
| `chore:` | none | Config, CI, deps, lint, tooling |
| `test:` | none | Tests only |
| `feat!:` / `BREAKING CHANGE:` footer | **major** | Removing a tool, renaming a parameter, breaking an existing Pi user's workflow |

Rules:

- **Never use `feat:` for metadata, description, or prompt wording changes.** Refining `description`, `promptSnippet`, `promptGuidelines`, or parameter descriptions is `refactor:` or `fix:` — not a new feature.
- **Never use `feat!:` or `BREAKING CHANGE:` for internal refactors.** Breaking changes mean a Pi user who installed this package will have their workflow break. Internal renames and config restructures are not breaking.
- **Default to `fix:` when in doubt** between `fix:` and `feat:`. It is always safer to under-bump.
- **Default to `refactor:` or `docs:`** for any change that does not alter runtime behavior visible to a Pi user.
