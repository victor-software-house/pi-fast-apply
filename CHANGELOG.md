# CHANGELOG

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
