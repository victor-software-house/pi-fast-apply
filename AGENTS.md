# pi-morph

Pi package repo for Morph-native integration work.

## Orient quickly

Read these files in order before changing behavior:

1. [`README.md`](README.md) — package purpose, package shape, development flow
2. [`ROADMAP.md`](ROADMAP.md) — ordered work items and acceptance criteria
3. [`extensions/index.ts`](extensions/index.ts) — current runtime truth
4. [`package.json`](package.json), [`biome.json`](biome.json), [`tsconfig.json`](tsconfig.json), [`lefthook.yml`](lefthook.yml), [`release.config.mjs`](release.config.mjs) — package metadata, lint/type rules, hooks, and release flow
5. [`assets/README.md`](assets/README.md) — preview-image expectations for `pi.image`

## Repo shape

- `extensions/` — Pi extension entrypoints
- `assets/` — screenshots and preview imagery for pi.dev metadata
- root docs — package overview, roadmap, and agent-operational guidance
- no generated runtime state should be committed

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
- This repo is expected to publish from `main` through semantic-release once it is ready.
