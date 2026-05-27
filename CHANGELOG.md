# CHANGELOG

## 0.4.3 — 2026-05-27

### Fixed

- Clarified `quick_edit` model-facing instructions to require the exact `// ... existing code ...` delimiter for every omitted existing-code span, including file prefix and suffix omissions.

## 0.4.2 — 2026-05-26

### Changed

- Bumped `@victor-software-house/pi-render-core` dependency floor to `>=0.5.0` so quick-edit and codebase-search renderers use the active Pi theme for diff gutters and syntax highlighting.

## 0.4.1 — 2026-05-26

### Added

- Re-exported `QuickEditDetails`, `CodebaseSearchDetails`, `DisplaySearchContext`, `buildSearchDetails`, and `formatSearchContent` so consumers can type render results without reaching into the package internals.

## 0.4.0 — 2026-05-26

### Changed

- Package runtime now ships compiled `dist/` output via `tsdown`; Pi loads `dist/index.mjs` instead of raw `extensions/` TypeScript.
- Exported reusable registration helpers and types so other Pi extensions can register Morph tools with custom filesystem/provider backends while sharing `/morph` auth and runtime config.
- Added `executeQuickEdit()` and `executeCodebaseSearch()` low-level helpers so consumers on a different typebox version can register their own Pi tools with custom schemas while reusing Morph orchestration, validation, redaction, and detail shaping.
- `quick_edit` and `codebase_search` factories now accept `extendParameters` and pass full params through `resolveFile`/`resolveApiKey`/`resolveRepoRoot`/`createProvider` hooks for multi-host scenarios.
- Bumped `@victor-software-house/pi-render-core` dependency floor to `>=0.4.9` and aligned Pi SDK peer floor with `@earendil-works/pi-coding-agent@>=0.75.5` plus latest published `ai`, `@types/node`, `eslint-plugin-zod`, `lefthook`, `oxlint`, `oxlint-tsgolint`, `tsx`, and `vitest`.
- Exported `createSafeRemoteWarpGrepProvider()` plus `RemoteCommands` re-export so SSH or sandbox integrations can supply `grep`/`read`/`listDir` stdout backends and reuse Morph's `RemoteCommandsProvider` with the same redaction layer as local search.

## 0.3.0 — 2026-05-25

### Changed

- Switched `quick_edit` diff rendering to `@victor-software-house/pi-render-core/diff`.
- Removed direct `@victor-software-house/pi-diff` dependency; Morph package now owns Morph execution only.

## 0.2.12 — 2026-05-25

### Changed

- Bumped `@victor-software-house/pi-render-core` dependency floor to `^0.3.0`, the release that removes the legacy `termW()` public API.

## 0.2.11 — 2026-05-25

### Changed

- Bumped render-stack dependency floors to `@victor-software-house/pi-diff@^0.6.10` and `@victor-software-house/pi-render-core@^0.3.0`.
- Removed direct `termW()` use from `quick_edit` and `codebase_search` renderers; expanded render paths now use Pi's `Component.render(width)` through shared `getWidthAwareText()`.
- Removed the obsolete local `@victor-software-house/pi-diff/render` type stub now that pi-diff ships compiled public types.

## 0.2.10 — 2026-05-25

### Fixed

- Removed `quick_edit` path access guards so Pi can edit any resolved file path, including absolute paths, parent traversal targets, symlink targets, and sensitive-looking filenames.

## 0.2.9 — 2026-05-25

### Fixed

- Import `@victor-software-house/pi-diff/render` through the scoped package export instead of the `pi-diff` alias, preventing Pi's extension loader from resolving the removed `pi-diff/src/render.ts` source path.

## 0.2.8 — 2026-05-25

### Fixed

- Bumped render dependencies to `@victor-software-house/pi-render-core@^0.2.1` and `pi-diff@^0.6.6` so Pi installs the native-schema write/edit rendering fixes for `codebase_search` rendering helpers without retaining older nested pi-diff packages.

## 0.2.7 — 2026-05-18

### Changed

- Line count shown in collapsed file list (`34L`) and expanded file header.

### Fixed

- `diff` DoS vulnerability in `@morphllm/morphsdk` is a transitive dep with no fix available (low severity).

## 0.2.6 — 2026-05-18

### Fixed

- NaN line numbers for whole-file contexts (`lines: '*'`).


## 0.2.5 — 2026-05-18

### Fixed

- `codebase_search` render: line numbers now correct for multi-range contexts.
  WarpGrep injects `// ... existing code, block starting at line N ...` markers
  between non-contiguous ranges; renderer now splits on these markers and assigns
  each sub-block its correct start line instead of numbering from the first range
  start throughout.
- `codebase_search` render: `(truncated)` removed from the file header. When
  content was cut at `MAX_CONTEXT_LINES`, the note now appears as a dim
  `… truncated — refine searchTerm for more` line at the bottom of the code
  block instead of polluting the header.
- Non-contiguous sub-blocks separated by a dim `┆` gutter character instead of
  nothing.

## 0.2.4 — 2026-05-18

### Fixed

- Replace broken `paths` redirect for `pi-diff/render` with a local type stub
  (`types/pi-diff-render.d.ts`). pi-diff ships only TypeScript source; the old
  path pointed to a non-existent `dist/` that caused CI typecheck to fall back
  to the raw source and fail under our strict `noUncheckedIndexedAccess` /
  `exactOptionalPropertyTypes` settings. The stub provides precise types for the
  symbols we actually consume without touching pi-diff's source.

## 0.2.3 — 2026-05-18

### Fixed

- Bump pi-diff to 0.5.7 to fix TS errors in CI typecheck.

## 0.2.2 — 2026-05-18

### Changed

- `codebase_search` expanded result now renders syntax-highlighted multi-section code blocks
  instead of a plain text dump. Each context block shows a file icon, bold path, dim line
  range, horizontal rule, and Shiki-highlighted lines with a line-number gutter. Highlighting
  loads async; the file list is shown immediately as a fallback.
- Collapsed result shows the file list as dim `path:lines` bullets instead of no detail.
- Added `@victor-software-house/pi-render-core@0.2.0` dependency for rendering primitives.

## 0.2.0 — 2026-05-18

### Changed

- `quick_edit` is now the **default file editor**, not a specialist fallback. Use it for any change with more than one context line; fall back to `edit` only for trivially unique single-string replacements.
- `dryRun` removed from the model-facing `quick_edit` schema — it was an operator concern, not a model concern.
- New files are created directly from `codeEdit` without an API round-trip when the path does not exist.
- `promptGuidelines` updated to enforce marker-first usage: prefer `quick_edit` with `// ... existing code ...` markers over rewriting unchanged lines.
- Live test suite added: 7 complex scenarios × 3 runs each with `toMatchSnapshot()`, covering block markers, inline multi-field markers, nested object skipping, reordering without retyping, sparse touch, and the verbatim marker edge case.
- README and AGENTS.md rewritten to reflect current tool names, marker patterns, commands, and feature flags.
- `instructions/morph-tools.md` removed — no Pi auto-load path at extension level; `promptGuidelines` is the correct mechanism.

## 0.1.4 — 2026-05-18

### Changed

- Renamed tool `fast_apply` → `quick_edit` / `Quick Edit`. Same Morph semantic merge; no schema change beyond the name.
- Tool descriptions made self-contained — no external file references.
- Reverted accidental suppression of the built-in `edit` tool; `edit` remains active as a fallback.
- Bumped `pi-diff` to 0.4.5 (termW floor fix).

## 0.1.3 — 2026-05-18

### Changed

- `useBuiltinTools` defaulted to `true` in the WarpGrep SDK patch — omits redundant `TOOL_SPECS` upload (~2.6 KB/turn) with zero latency or token billing impact.
- `codebase_search` schema expanded: `includes`, `excludes`, `searchType` args; WarpGrep SDK patch adds model/temp/maxTokens/maxTurns/includes options.
- Quick wins from opencode-morph-plugin comparison applied to tool descriptions and prompt metadata.
- CI fallback to `github.token` when `GH_PACKAGES_TOKEN` is unset.
- Bumped `pi-diff` to 0.4.4 (bg-preserving reset).

## 0.1.2 — 2026-05-18

### Changed

- Peer range for `@earendil-works/*` bumped from `>=0.74.0` to `>=0.75.0` to match Pi 0.75.x. No API surface changes were required; the imports used by this package are unchanged across the 0.74 → 0.75 upgrade.

## 0.1.1 — 2026-05-12

- Scoped package to `@victor-software-house/pi-fast-apply`.
- Set pnpm 11.1.1 + Node 24 LTS baseline.
- Moved Pi runtime deps to optional peers on `@earendil-works/*`.
- Switched publish metadata to private GitHub Packages.
- Added CI/release workflows for tagged publish flow.
- Removed transitive legacy runtime refs from source.
