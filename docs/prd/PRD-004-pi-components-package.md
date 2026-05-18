---
title: "pi-components Public Extension Package"
prd: PRD-004
status: Draft
owner: "Victor Software House"
issue: "N/A"
date: 2026-05-17
version: "1.0"
---

# PRD: pi-components Public Extension Package

---

## 1. Problem & Context

Two Pi extension packages in the `pi-ecosystem` workspace currently depend on the same UI components: `ChecklistPanel`, `createBorderedWidget`, `createChecklistAction`, and `describeChecklistActions`. These components live in a non-distributable local library at `~/.pi/agent/lib/pi-components/` that is:

* not versioned independently,
* not available to packages installed in foreign Pi environments,
* not testable in CI without the full `.pi` config repo available,
* duplicated in any new extension that needs the same primitives.

The two current consumers are:

* `~/.pi/agent/lib/` itself (directly imported at runtime from `pi-cmux`, `pi-tasks`, `pi-extension-manager`, and similar packages that reference `lib/pi-components`)
* `pi-anthropic-adapter` (imports directly from the local lib path)
* `pi-fast-apply` (will need `ChecklistPanel` after PRD-003 implementation)

Extracting into `@victor-software-house/pi-components` makes the primitives available to any Pi extension in the ecosystem without local path dependencies.

---

## 2. Goals & Success Metrics

| Goal                         | Metric                                                          | Target                                                                                               |
| ---------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Distributable primitives** | `ChecklistPanel` and `createBorderedWidget` importable from npm | `import { ChecklistPanel } from '@victor-software-house/pi-components'` succeeds in any Pi extension |
| **No sensitive data**        | Package contains only pure TUI components                       | Security review: no auth, no secrets, no Pi-internal APIs                                            |
| **Both consumers migrated**  | `pi-anthropic-adapter` and `pi-fast-apply` import from package  | No remaining references to `~/.pi/agent/lib/pi-components/` in either package                        |
| **Local lib retired**        | `~/.pi/agent/lib/pi-components/` removed after migration        | Chezmoi no longer tracks the `lib/pi-components` directory                                           |

---

## 3. Users & Use Cases

### Primary: Pi extension developer writing a checklist or settings UI

> As a Pi extension developer, I want to import `ChecklistPanel` from a versioned package so that my extension works in any Pi environment without requiring local file path access.

### Primary: Pi extension developer using `createBorderedWidget`

> As a Pi extension developer, I want a simple `createBorderedWidget(theme, options)` factory for styled bordered TUI elements.

### Secondary: Package maintainer

> As maintainer, I want the component package to have CI, typed exports, and a release workflow so it can be updated and versioned independently.

---

## 4. Scope

### In scope

1. **New package `@victor-software-house/pi-components`** — ported from `~/.pi/agent/lib/pi-components/`.
2. **Exports:** `ChecklistPanel`, `describeChecklistActions`, `createChecklistAction`, `createBorderedWidget`, and all associated types (`ChecklistItem`, `ChecklistState`, `ChecklistAction`, `ChecklistActionContext`, `ChecklistPanelOptions`, `BorderedWidgetOptions`, `ChecklistActionPreset`, `ChecklistActionOverrides`).
3. **Dependencies:** `@earendil-works/pi-coding-agent` (peer) and `@earendil-works/pi-tui` (peer) only.
4. **CI + release** — matching VSH Pi package baseline (pnpm, TypeScript strict, Biome+oxlint, lefthook, tag-driven GitHub Packages release).
5. **`pi-fast-apply` migration** — add dependency and import from package (Phase 2 of PRD-003).
6. **`pi-anthropic-adapter` migration** — update import to package.

### Out of scope / later

| What                                            | Why                                                               | Tracked in             |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| Exporting `SettingsList` wrappers               | `SettingsList` is a Pi TUI built-in; no need to wrap it           | Future if needed       |
| Moving `pi-cmux`, `pi-tasks` to the new package | Those local-lib consumers are separate Pi packages; migrate later | Separate PRD if needed |
| Adding new UI components in this scope          | Scope is extraction only; no new functionality                    | Future feature         |

---

## 5. Functional Requirements

### FR-1: Package exports ChecklistPanel and related types

**Acceptance criteria:**

```gherkin
Given @victor-software-house/pi-components is installed
When a Pi extension imports ChecklistPanel
Then the component mounts and handles input correctly
And all exported types match the local lib equivalents
```

**Files:**

* `~/workspace/victor/pi-ecosystem/pi-components/src/checklist/panel.ts`
* `~/workspace/victor/pi-ecosystem/pi-components/src/checklist/actions.ts`
* `~/workspace/victor/pi-ecosystem/pi-components/src/checklist/index.ts`
* `~/workspace/victor/pi-ecosystem/pi-components/src/index.ts`

### FR-2: Package exports createBorderedWidget

**Acceptance criteria:**

```gherkin
Given @victor-software-house/pi-components is installed
When a Pi extension imports createBorderedWidget
Then it returns a styled Container with DynamicBorder and Text children
```

**Files:**

* `~/workspace/victor/pi-ecosystem/pi-components/src/bordered.ts`

### FR-3: pi-fast-apply uses package instead of local lib

**Acceptance criteria:**

```gherkin
Given pi-fast-apply depends on @victor-software-house/pi-components
When typecheck runs
Then there are no import errors for ChecklistPanel or createBorderedWidget
```

### FR-4: pi-anthropic-adapter uses package instead of local lib

**Acceptance criteria:**

```gherkin
Given pi-anthropic-adapter depends on @victor-software-house/pi-components
When typecheck runs
Then there are no import errors for ChecklistPanel
```

---

## 6. Non-Functional Requirements

| Category          | Requirement                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| **Security**      | Package contains no auth, secrets, credentials, or Pi-internal APIs. Only `@earendil-works/pi-tui` primitives. |
| **TypeScript**    | Strict mode; generates `.d.ts`; `exactOptionalPropertyTypes: true`.                                            |
| **Peer deps**     | `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` as peerDependencies (not bundled).              |
| **Package size**  | No runtime dependencies; total package footprint < 20 KB.                                                      |
| **API stability** | Public exports must not change without a semver major bump.                                                    |

---

## 7. Risks & Assumptions

### Risks

| Risk                                                                    | Severity | Likelihood | Mitigation                                                 |
| ----------------------------------------------------------------------- | -------- | ---------- | ---------------------------------------------------------- |
| Local lib callers in `~/.pi/agent/lib/` other than pi-anthropic-adapter | Medium   | Medium     | Audit all local lib callers before removing the directory. |
| Breaking change if `@earendil-works/pi-tui` types change                | Medium   | Low        | Pin peer dep range; test at current Pi version.            |
| Release cadence drift                                                   | Low      | Low        | Align with VSH package baseline; use tag-driven release.   |

### Assumptions

* `ChecklistPanel` component behavior is identical between local lib and published package.
* Pi packages that currently import from local `lib/pi-components` can be migrated incrementally; the local lib is not removed until all consumers have switched.
* `DynamicBorder` is exported from `@earendil-works/pi-coding-agent` and `Container`, `Text`, `Input`, `Spacer`, etc. are from `@earendil-works/pi-tui`.

---

## 8. Design Decisions

### D1: New top-level package, not a sub-export of an existing package

**Options considered:**

1. Add to `pi-fast-apply` as an export — wrong scope; not reusable.
2. Add to `pi-diff` or another utility package — wrong cohesion.
3. Standalone `@victor-software-house/pi-components` — clean, proper scope.

**Decision:** Option 3 — standalone package.

### D2: Peer dependencies for Pi TUI, not bundled

**Options considered:**

1. Bundle `@earendil-works/pi-tui` — increases package size, risks version conflicts.
2. Peer deps — callers provide the Pi TUI that matches their Pi version.

**Decision:** Peer deps.

**Rationale:** Pi extensions already have these deps; bundling would create duplicate instances.

---

## 9. File Breakdown

| File                                                                          | Change type | FR         | Description                                            |
| ----------------------------------------------------------------------------- | ----------- | ---------- | ------------------------------------------------------ |
| `~/workspace/victor/pi-ecosystem/pi-components/src/bordered.ts`               | New         | FR-2       | `createBorderedWidget` factory.                        |
| `~/workspace/victor/pi-ecosystem/pi-components/src/checklist/panel.ts`        | New         | FR-1       | `ChecklistPanel` component and types.                  |
| `~/workspace/victor/pi-ecosystem/pi-components/src/checklist/actions.ts`      | New         | FR-1       | `createChecklistAction`, `CHECKLIST_ACTION_DEFAULTS`.  |
| `~/workspace/victor/pi-ecosystem/pi-components/src/checklist/index.ts`        | New         | FR-1       | Re-exports.                                            |
| `~/workspace/victor/pi-ecosystem/pi-components/src/index.ts`                  | New         | FR-1, FR-2 | Package entry point.                                   |
| `~/workspace/victor/pi-ecosystem/pi-components/package.json`                  | New         | FR-1, FR-2 | VSH package baseline.                                  |
| `~/workspace/victor/pi-ecosystem/pi-components/tsconfig.json`                 | New         | FR-1, FR-2 | Strict TS config.                                      |
| `~/workspace/victor/pi-ecosystem/pi-components/.github/workflows/ci.yml`      | New         | FR-1       | Standard VSH CI.                                       |
| `~/workspace/victor/pi-ecosystem/pi-components/.github/workflows/release.yml` | New         | FR-1       | Tag-driven GitHub Packages release.                    |
| `pi-fast-apply/package.json`                                                  | Modify      | FR-3       | Add `@victor-software-house/pi-components` dependency. |
| `pi-anthropic-adapter/package.json`                                           | Modify      | FR-4       | Add `@victor-software-house/pi-components` dependency. |
| `~/.pi/agent/lib/pi-components/`                                              | Delete      | FR-3, FR-4 | Remove after all consumers migrated.                   |

---

## 10. Dependencies & Constraints

* VSH package baseline (pnpm, `engines.node >= 24`, strict TypeScript, Biome+oxlint, lefthook).
* GitHub Packages registry with `@victor-software-house` scope.
* Peer: `@earendil-works/pi-coding-agent >= 0.74.0`, `@earendil-works/pi-tui >= 0.74.0`.
* Must be published before `pi-fast-apply` can import from it (Phase 1 of PRD-003 rollout).

---

## 11. Rollout Plan

1. Create `~/workspace/victor/pi-ecosystem/pi-components/` with package scaffold.
2. Port `ChecklistPanel`, actions, `createBorderedWidget` and types.
3. Add CI/CD (standard VSH workflows).
4. Publish `@victor-software-house/pi-components@0.1.0`.
5. Update `pi-fast-apply` to import from package (parallel with PRD-003 Phase 2).
6. Update `pi-anthropic-adapter` to import from package.
7. Audit `~/.pi/agent/lib/pi-components/` callers.
8. Remove `~/.pi/agent/lib/pi-components/` when all consumers are migrated.

---

## 12. Open Questions

| #  | Question                                                                                               | Owner                 | Due                   | Status |
| -- | ------------------------------------------------------------------------------------------------------ | --------------------- | --------------------- | ------ |
| Q1 | Are there other `~/.pi/agent/lib/pi-components` callers beyond pi-anthropic-adapter and pi-fast-apply? | Victor Software House | Before rollout step 7 | Open   |
| Q2 | Should the initial version start at `0.1.0` or `1.0.0`?                                                | Victor Software House | Before publish        | Open   |
| Q3 | Should `DynamicBorder` be re-exported from this package for convenience?                               | Victor Software House | Before Phase 1        | Open   |

---

## 13. Related

| Issue                                                                       | Relationship                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [PRD-003 Morph Config Pane and Auth](PRD-003-morph-config-pane-and-auth.md) | Primary consumer of the new package; blocked by this PRD for Phase 1 |

---

## 14. Changelog

| Date       | Change        | Author                |
| ---------- | ------------- | --------------------- |
| 2026-05-17 | Initial draft | Victor Software House |
