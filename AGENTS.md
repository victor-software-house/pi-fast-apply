# pi-fast-apply

Pi package repo for Morph-native integration work.

## Orient quickly

Read in order before changing behavior:

1. [`README.md`](README.md) — tool contract, marker patterns, auth, commands, dev flow
2. [`ROADMAP.md`](ROADMAP.md) — ordered work items and specdocs index
3. [`extensions/index.ts`](extensions/index.ts) — registration and lifecycle wiring
4. [`extensions/quick-edit-tool.ts`](extensions/quick-edit-tool.ts) — `quick_edit` implementation
5. [`extensions/codebase-search-tool.ts`](extensions/codebase-search-tool.ts) — `codebase_search` implementation
6. [`extensions/commands.ts`](extensions/commands.ts) — `/morph` command family
7. [`extensions/morph-apply.ts`](extensions/morph-apply.ts) — Morph API wrapper and safety guards
8. [`extensions/runtime-config.ts`](extensions/runtime-config.ts) — env/auth/URL config
9. [`extensions/secret-redaction.ts`](extensions/secret-redaction.ts) — Secretlint-backed WarpGrep redaction
10. [`package.json`](package.json), [`biome.json`](biome.json), [`tsconfig.json`](tsconfig.json), [`lefthook.yml`](lefthook.yml) — tooling config
11. [`patches/@morphllm__morphsdk@0.2.171.patch`](patches/@morphllm__morphsdk@0.2.171.patch) — SDK patches for `auto` default, WarpGrep timings, model/generation/limits config, `includes`, `useBuiltinTools`

## Repo shape

```
extensions/          Pi extension source — all model-facing tools and commands
  quick-edit-tool.ts   quick_edit (Morph Fast Apply, default file editor)
  codebase-search-tool.ts  codebase_search (Morph WarpGrep)
  commands.ts          /morph command family (login/logout/status/probe)
  morph-apply.ts       applyEdit wrapper, safety guards, QuickEditDetails type
  runtime-config.ts    WarpGrepClientConfig, ApplyEditConfig, env resolution
  secret-redaction.ts  Secretlint + TruffleHog redaction for WarpGrep output
  auth.ts              Morph API key resolution from Pi auth storage or env
  constants.ts         Shared constants (marker string, provider ID, env names)
  index.ts             Extension entrypoint — registers tools, lifecycle hooks
instructions/        Routing guidance for agents without Pi tool metadata
  morph-tools.md       Marker patterns reference (not auto-loaded in Pi)
test/                Test suite
  quick-edit-live.test.ts   Live marker expansion tests (7 scenarios × 3 runs)
  codebase-search-live.test.ts  Live WarpGrep + redaction tests
  codebase-search-timing.ts    WarpGrep timing harness
  codebase-search-tool.test.ts  Unit tests for search tool
  workspace-path-guards.test.ts Unit tests for path/security guards
patches/             pnpm patches for @morphllm/morphsdk@0.2.171
docs/                Specdocs (PRDs, plans, ADRs)
```

## Working rules

- Pi-native first. Pi owns path resolution, mutation queueing, and operator-visible rendering. Morph owns semantic merge and search only.
- Keep implementation claims grounded in committed code. No aspirational docs.
- `quick_edit` is the default editor. Preserve that framing in all descriptions and docs.
- Marker patterns are the core value proposition — enforce them in descriptions, guidelines, instructions, and tests.
- SDK patches are fragile across upgrades. Every patch area must have test coverage. Document all patch areas in `ROADMAP.md`.
- `instructions/morph-tools.md` ships with the package for non-Pi agents. It is not auto-loaded in Pi (Pi uses tool `promptGuidelines` instead).
- Ask before changing release flow, package name, publishing shape, or repository visibility.
- Package runtime loads from compiled `dist/index.mjs`; do not point Pi package metadata back at raw `extensions/` TypeScript.
- Reusable consumers should call exported registration helpers (`registerMorphTools`, `registerQuickEditTool`, `registerCodebaseSearchTool`) and inject host-specific `fileOps`, `resolveRepoRoot`, or WarpGrep providers instead of copying Morph auth/API/config/tool logic.
- Keep `/morph` auth/config as the shared source of truth. SSH or sandbox integrations should reuse default `resolveApiKey` / `resolveRuntimeConfig` unless they have an explicit separate credential boundary.

## Gate before committing

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Also run `pnpm install` when deps, hooks, or workspace config change.

Run auto-fix first: `pnpm run fix && pnpm run format`

## Live tests

Live tests require `MORPH_API_KEY` and are skipped automatically without it:

```bash
MORPH_API_KEY="$(fnox get MORPH_API_KEY)" pnpm run test:quick-edit-live
MORPH_API_KEY="$(fnox get MORPH_API_KEY)" pnpm run test:morph-matrix
```

Update snapshots after Morph model output changes:

```bash
MORPH_API_KEY="$(fnox get MORPH_API_KEY)" pnpm run test:quick-edit-live -- --update-snapshots
```

## Import rules

- TypeScript strict. Fix type errors; never weaken tsconfig.
- Single quotes for imports. No `.ts`/`.js` extensions in import paths.
- `import type` for type-only imports.
- No hidden Pi internals from non-public paths.

## Git workflow

- Conventional Commits.
- Small, reviewable commits.
- Keep `lefthook` hooks working.

## Release pipeline

This repo uses **Changesets** for versioning and publishing to GitHub Packages.

### Workflow

1. PRs that affect the published package must include a changeset file (`pnpm exec changeset`).
2. The `changesets/action` GitHub Action (`.github/workflows/release.yml`) maintains a "Version Packages" PR on `main`.
3. Merging the "Version Packages" PR bumps `package.json`, updates `CHANGELOG.md`, and publishes to GitHub Packages.
4. CI checks changeset status on PRs (`changeset status --since=origin/main`).

### Bump rules

| Changeset type | When to use | Example |
|:---|:---|:---|
| `patch` | **Default.** Bug fixes, improvements, behavioral adjustments | Fix marker expansion, update guidelines |
| `minor` | Net-new user-facing tool or command | New `/morph` subcommand |
| `major` | **Rarely.** Removed/renamed tool, breaking Pi user workflow | Never without explicit justification |

**DO:** default to `patch` for almost everything.
**DO NOT:** use `minor` for changes to an existing feature. Adding a parameter to an existing tool is `patch`.
**DO NOT:** use `major` without explicit justification — npm versions are permanent.

### Pre-push checklist

If the push includes `fix:` or `feat:` commits and no `.changeset/*.md` file exists:
1. Run `pnpm exec changeset` — select `patch` and write a consumer-facing summary.
2. `git add .changeset/ && git commit -m "chore: add changeset"`

If the push intentionally should not release, run `pnpm exec changeset --empty`.

## Version bump discipline

npm versions are permanent. Under-bump is recoverable; over-bump is not.

| Changeset type | Bump | When |
|:--|:--|:--|
| `patch` | patch | Bug fix or behavioral correction |
| `minor` | minor | New tool, new command, new auth path |
| `major` | **major** | Removing a tool, renaming a parameter, breaking existing Pi user workflow |

Rules:
- `patch` is the default. Use for fixes, improvements, guideline/description changes.
- `minor` is for net-new user-facing capabilities only.
- `major` means a Pi user's workflow breaks. Internal renames are not breaking.
- Default to `patch` when unsure. No changeset needed for `chore:`/`docs:`/`test:`/`refactor:` commits.
