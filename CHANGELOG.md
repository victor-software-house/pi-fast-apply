# CHANGELOG

## 0.2.0 — 2026-05-18

### Changed

- `quick_edit` is now the **default file editor**, not a specialist fallback. Use it for any change with more than one context line; fall back to `edit` only for trivially unique single-string replacements.
- `dryRun` removed from the model-facing `quick_edit` schema — it was an operator concern, not a model concern.
- New files are created directly from `codeEdit` without an API round-trip when the path does not exist.
- `promptGuidelines` updated to enforce marker-first usage: prefer `quick_edit` with `// ... existing code ...` markers over rewriting unchanged lines.
- Live test suite added: 7 complex scenarios × 3 runs each with `toMatchSnapshot()`, covering block markers, inline multi-field markers, nested object skipping, reordering without retyping, sparse touch, and the verbatim marker edge case.
- README and AGENTS.md rewritten to reflect current tool names, marker patterns, commands, and feature flags.
- `instructions/morph-tools.md` removed — no Pi auto-load path at extension level; `promptGuidelines` is the correct mechanism.

## 0.1.2 — 2026-05-18

### Changed

- Peer range for `@earendil-works/*` bumped from `>=0.74.0` to `>=0.75.0` to match Pi 0.75.x. No API surface changes were required; the imports used by this package are unchanged across the 0.74 → 0.75 upgrade.

## Unreleased

## 0.1.1 — 2026-05-12

- Scoped package to `@victor-software-house/pi-fast-apply`.
- Set pnpm 11.1.1 + Node 24 LTS baseline.
- Moved Pi runtime deps to optional peers on `@earendil-works/*`.
- Switched publish metadata to private GitHub Packages.
- Added CI/release workflows for tagged publish flow.
- Removed transitive legacy runtime refs from source.
