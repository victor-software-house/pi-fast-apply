---
title: "Morph Config Pane, Command Consolidation, and 1Password Auth"
prd: PRD-003
status: Draft
owner: "Victor Software House"
issue: "N/A"
date: 2026-05-17
version: "1.0"
---

# PRD: Morph Config Pane, Command Consolidation, and 1Password Auth

---

## 1. Problem & Context

`pi-fast-apply` currently exposes five separate operator commands (`/morph-login`, `/morph-logout`, `/morph-status`, `/morph-probe`, `/morph-set-url`) that address Morph configuration via text output and `ctx.ui.input()` prompts. This design predates the Pi `SettingsList` API and the pattern established by `pi-anthropic-adapter`, which provides a single `/anthropic` command with a polished `SettingsList`-based config pane as the default subcommand.

Three concrete gaps:

1. **Fragmented commands** — operators need to know five separate slash commands for related configuration; there is no single place to see or change all Morph settings at once.
2. **No config pane** — current commands produce text notifications and require memorizing subcommand names, rather than offering a navigable, keyboard-driven SettingsList UI.
3. **Auth limited to Pi auth storage and env var** — no 1Password integration. The `pi-anthropic-adapter` demonstrates that capturing an API key during login and mirroring it to an adapter-owned 1Password item (via the `@1password/sdk` + service account token resolved from `OP_SERVICE_ACCOUNT_TOKEN` or `fnox get OP_SERVICE_ACCOUNT_TOKEN`) is production-ready and resilient across Pi process restarts.

Additionally, the `ChecklistPanel` and `createBorderedWidget` UI components that both `pi-anthropic-adapter` and future Pi extensions need currently live in a non-public `~/.pi/agent/lib/pi-components/` local library. Extracting these into a publishable `@victor-software-house/pi-components` package would remove duplication and make them available to any Pi extension in the ecosystem.

---

## 2. Goals & Success Metrics

| Goal                                   | Metric                                                                 | Target                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Single command entry point**         | Number of top-level slash commands for Morph config                    | 1 (`/morph`)                                                              |
| **Polished config pane**               | `SettingsList` pane opens from `/morph` with no args                   | Navigable via ↑/↓/Space/Enter/Esc; shows all settings with current values |
| **1Password API key storage**          | Morph API key restored from 1Password on process start when configured | Key resolves on `session_start` without requiring operator re-entry       |
| **Minimal env var config still works** | `MORPH_API_KEY` still accepted as fallback                             | Existing setups requiring no changes                                      |
| **pi-components public**               | `@victor-software-house/pi-components` published                       | pi-anthropic-adapter and pi-fast-apply import from package, not local lib |

**Guardrails (must not regress):**

* `fast_apply` and `codebase_search` tool behavior must not change.
* Pi auth storage path (`/morph login` entering key once) must still work.
* `MORPH_API_KEY` env var fallback must still work.
* `MORPH_EDIT=false` and `MORPH_WARPGREP=false` env flags must still work.
* No API key must appear in logs, notifications, or rendered text.

---

## 3. Users & Use Cases

### Primary: Pi operator configuring Morph for first time

> As a Pi operator, I want to open `/morph` and see a navigable settings pane where I can enter my API key, choose the auth source, and confirm settings — without memorizing five subcommands.

**Preconditions:** Package installed; no existing Morph config.

### Primary: Pi operator who uses 1Password

> As a Pi operator with `OP_SERVICE_ACCOUNT_TOKEN` or `fnox get OP_SERVICE_ACCOUNT_TOKEN` available, I want my Morph API key automatically restored from an adapter-owned 1Password item on each Pi start so I never type the key again.

**Preconditions:** 1Password SDK service account with Admin Keys vault access; `fnox get OP_SERVICE_ACCOUNT_TOKEN` returns token.

### Secondary: Pi extension maintainer

> As a Pi extension developer, I want to import `ChecklistPanel` and `createBorderedWidget` from `@victor-software-house/pi-components` instead of copying the local library.

**Preconditions:** Package published to GitHub Packages; `~/.npmrc` has `@victor-software-house` registry token.

### Future: Operator managing multiple Morph config options

> As a Pi operator, I want to change the Morph API URL, timeout, and feature flags through the same pane without touching environment variables.

**Preconditions:** Config pane settings map to runtime config state as well as persisted JSON config.

---

## 4. Scope

### In scope

1. **`/morph` command consolidation** — single command with subcommands `panel` (default), `login`, `logout`, `status`, `probe`, `show`, `help`.
2. **`SettingsList` config pane** — `openMorphSettingsPanel()` with: API key source (env / Pi auth storage / 1Password), API key input (sensitive submenu, displays masked), API URL override, timeout, and tool-enable flags.
3. **Config persistence** — Morph operator config persisted to `~/.pi/agent/config/pi-fast-apply.json` (or equivalent Pi config path), `chmod 0600`.
4. **1Password auth mode** — when selected: resolve key from 1Password on `session_start`; capture key entered via `/morph login` into adapter-owned 1Password item; restore on next session.
5. **OP service account token resolution** — try `OP_SERVICE_ACCOUNT_TOKEN` env var, then `fnox get OP_SERVICE_ACCOUNT_TOKEN`; cache in process memory; clear on mode change or `/morph logout`.
6. **`@victor-software-house/pi-components` package extraction** — move `ChecklistPanel`, `describeChecklistActions`, `createChecklistAction`, `createBorderedWidget` and their types into a new publishable package; no sensitive data.
7. **Update `pi-fast-apply` to import from the new package.**
8. **Coordinate `pi-anthropic-adapter` migration** — update its `ChecklistPanel` import to the new package (separate commit/PR).
9. **Remove `~/.pi/agent/lib/pi-components/` after both consumers migrated.**

### Out of scope / later

| What                             | Why                                                                     | Tracked in |
| -------------------------------- | ----------------------------------------------------------------------- | ---------- |
| Context Compaction hook          | Separate workstream; PRD-001 already covers this                        | PRD-001    |
| GitHub search tool               | SDK ready; small separate addition                                      | ROADMAP    |
| `/morph reset` hard config wipe  | Low priority; `/morph logout` + delete config file covers this manually | Later      |
| Private GitHub repository search | Requires separate auth design                                           | Future PRD |

### Design for future (build with awareness)

* Config schema designed to accept new optional fields without migration; use `undefined` for unset rather than defaulting to something that changes behavior.
* 1Password integration factored through a `credentials/` module similar to `pi-anthropic-adapter` so it can be adopted by other Morph Pi packages later.

---

## 5. Functional Requirements

### FR-1: Consolidate all Morph commands under `/morph`

All existing `/morph-*` commands must be replaced by `/morph [subcommand]`.

**Acceptance criteria:**

```gherkin
Given the pi-fast-apply extension is loaded
When the operator runs /morph with no arguments
Then the Morph settings config pane opens
```

```gherkin
When the operator runs /morph login
Then they are prompted to enter an API key (existing behavior)
```

```gherkin
When the operator runs /morph-login (old command)
Then Pi shows "unknown command" or equivalent (old command removed)
```

**Files:**

* `extensions/commands.ts` — consolidate commands.
* `extensions/index.ts` — register `/morph` only.

### FR-2: SettingsList config pane

`/morph` (no args) opens a `SettingsList` pane with all settings navigable.

Required settings rows:

| Row ID            | Label                    | Type              | Values / Behavior                                               |
| ----------------- | ------------------------ | ----------------- | --------------------------------------------------------------- |
| `authSource`      | API key source           | enum              | `env`, `pi-auth`, `1password`                                   |
| `apiKey`          | Morph API key            | sensitive submenu | shows masked `sk-...XXXX`; input stores in selected auth source |
| `apiUrl`          | API base URL             | input submenu     | default `https://api.morphllm.com`                              |
| `timeoutMs`       | Request timeout (ms)     | input submenu     | numeric; default 60000                                          |
| `editEnabled`     | fast\_apply enabled      | bool toggle       | `true` / `false`                                                |
| `warpgrepEnabled` | codebase\_search enabled | bool toggle       | `true` / `false`                                                |

**Acceptance criteria:**

```gherkin
Given /morph opens the settings pane
When the operator navigates to API key source and cycles to "1password"
Then the pane immediately updates to show the 1Password auth mode description
And the next session_start attempts to resolve the key from 1Password
```

**Files:**

* `extensions/ui.ts` (new) — `openMorphSettingsPanel()`.
* `extensions/config.ts` (new) — `loadConfig()`, `saveConfig()`, `normalizeConfig()`.
* `extensions/state.ts` (new) — singleton module state.
* `extensions/constants.ts` — add `CONFIG_PATH`, `MORPH_COMMAND`, `SUBCOMMANDS`.

### FR-3: Config persistence

Config saved to `~/.pi/agent/config/pi-fast-apply.json` with `0600` permissions.

**Acceptance criteria:**

```gherkin
Given the operator changes API URL in the pane
When the panel closes
Then ~/.pi/agent/config/pi-fast-apply.json contains the updated apiUrl
And the file mode is 0600
```

**Files:**

* `extensions/config.ts` — JSON read/write with `chmod 0600`.

### FR-4: 1Password auth mode

When `authSource === '1password'` on `session_start`, resolve Morph API key from adapter-owned 1Password item and apply it as the runtime key.

**Acceptance criteria:**

```gherkin
Given OP_SERVICE_ACCOUNT_TOKEN or fnox get OP_SERVICE_ACCOUNT_TOKEN returns a valid token
And authSource is 1password
When a new Pi session starts
Then the Morph API key is resolved from 1Password
And fast_apply and codebase_search succeed with no manual key entry
```

```gherkin
Given authSource is 1password and service account token is unavailable
When session_start runs
Then the operator sees a warning: "Morph 1Password key unavailable — set OP_SERVICE_ACCOUNT_TOKEN or configure fnox"
And fast_apply and codebase_search fall back to next auth source
```

**Files:**

* `extensions/credentials/token-source.ts` — resolve OP service account token.
* `extensions/credentials/onepassword-storage.ts` — read/write Morph key to 1Password.
* `extensions/auth.ts` — extend `ensureMorphApiKey()` to include 1Password source.
* `extensions/index.ts` — add `session_start` handler to apply runtime key.

### FR-5: Key capture via `/morph login`

When authSource is `1password` and the operator runs `/morph login` and enters a key, the key is mirrored to the adapter-owned 1Password item.

**Acceptance criteria:**

```gherkin
Given authSource is 1password
When the operator runs /morph login and enters a valid sk-... key
Then the key is set as runtime override AND written to 1Password
And subsequent sessions restore the key from 1Password without re-entry
```

**Files:**

* `extensions/commands.ts` — `/morph login` flow for 1Password capture.
* `extensions/credentials/onepassword-storage.ts` — write Morph API key.

### FR-6: pi-components extraction

Publish `ChecklistPanel`, `describeChecklistActions`, `createChecklistAction`, `createBorderedWidget`, and all their types as `@victor-software-house/pi-components`.

**Acceptance criteria:**

```gherkin
Given pi-fast-apply depends on @victor-software-house/pi-components
When it imports ChecklistPanel
Then the import resolves without errors and type-checks correctly
```

```gherkin
Given pi-anthropic-adapter depends on @victor-software-house/pi-components
When it imports ChecklistPanel
Then the import resolves without errors and type-checks correctly
```

**Files:**

* `~/workspace/victor/pi-ecosystem/pi-components/` (new package).
* `~/workspace/victor/pi-ecosystem/pi-fast-apply/package.json` — add dependency.
* `~/workspace/victor/pi-ecosystem/pi-anthropic-adapter/package.json` — add dependency.
* `~/.pi/agent/lib/pi-components/` — remove after both consumers migrated.

---

## 6. Non-Functional Requirements

| Category                  | Requirement                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| **Security**              | API key never logged, never printed, never in rendered text — only masked (`sk-...XXXX`).      |
| **Security**              | 1Password service account token never on disk; resolved in-process from env or fnox on demand. |
| **Operator UX**           | Config pane opens in under 200ms.                                                              |
| **Compatibility**         | `MORPH_API_KEY` env var and Pi auth storage continue working unchanged.                        |
| **Patch maintainability** | No changes to the existing SDK patch; this PRD only touches Pi extension code.                 |

---

## 7. Risks & Assumptions

### Risks

| Risk                                                                                     | Severity | Likelihood | Mitigation                                                                                                                   |
| ---------------------------------------------------------------------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@1password/sdk` breaks across Node versions                                             | Medium   | Low        | Pin tested version; test at Node 24 matching repo engines.                                                                   |
| `fnox get` adds startup latency                                                          | Low      | Medium     | Cache token in module memory after first resolve.                                                                            |
| Config schema drift between `pi-fast-apply` and `pi-anthropic-adapter` 1Password modules | Medium   | Medium     | Extract shared token-source and onepassword-storage modules into `pi-components` or a shared `pi-morph-auth` in a follow-up. |
| `pi-components` publish breaks `pi-anthropic-adapter` import during transition           | Medium   | Low        | Add `pi-components` dependency to adapter before removing local lib.                                                         |

### Assumptions

* `@1password/sdk` service account pattern is already working in `pi-anthropic-adapter`; reuse the same pattern.
* `fnox get OP_SERVICE_ACCOUNT_TOKEN` is available on the target machine.
* Pi `SettingsList` and `Input` APIs are stable at the current Pi version used by this package.
* `pi-components` package will live under `~/workspace/victor/pi-ecosystem/pi-components/` and publish to `@victor-software-house` GitHub Packages under the same release pattern as other packages in the workspace.

---

## 8. Design Decisions

### D1: Single `/morph` command with subcommands (not `/morph settings`, `/morph config`)

**Options considered:**

1. Keep five separate commands — familiar but scattered.
2. Merge into `/morph` with subcommands — mirrors `pi-anthropic-adapter`, single autocomplete entry, panel-first.
3. Rename to `/morph-settings` as a single new command — partial fix but leaves old commands.

**Decision:** Option 2 — consolidate into `/morph [panel|login|logout|status|probe|show|help]`.

**Rationale:** Matches `pi-anthropic-adapter` operator UX; easier autocomplete; cleaner help text.

### D2: Store config at `~/.pi/agent/config/pi-fast-apply.json`

**Options considered:**

1. Pi auth storage only — no separate config file.
2. Separate JSON file at `~/.pi/agent/config/` — matches adapter pattern.
3. Environment-only — no persistence.

**Decision:** Option 2 — JSON config file.

**Rationale:** Allows non-auth settings (URL, timeout, flags) to persist across sessions. Follows `pi-anthropic-adapter` precedent.

### D3: Reuse pi-anthropic-adapter 1Password pattern as-is

**Options considered:**

1. Build Morph-specific 1Password integration from scratch — more control.
2. Copy `token-source.ts` + `onepassword-storage.ts` pattern verbatim — duplication.
3. Extract shared modules into `pi-components` immediately — cleaner, but larger scope.

**Decision:** Copy pattern into `extensions/credentials/` for this package now; extract into a shared package in a follow-up.

**Rationale:** Avoids blocking this PRD on the `pi-components` extraction; duplication is bounded and explicit.

### D4: Extract pi-components into a separate published package

**Options considered:**

1. Keep local lib in `~/.pi/agent/lib/pi-components/` — zero distribution.
2. Bundle into `pi-fast-apply` directly — increases package size unnecessarily.
3. New `@victor-software-house/pi-components` package — clean, reusable, consistent with VSH package baseline.

**Decision:** Option 3 — new published package.

**Rationale:** Both `pi-anthropic-adapter` and `pi-fast-apply` need these components. A published package allows version-controlled API with proper types, CI, and release workflow aligned with the workspace baseline.

---

## 9. File Breakdown

| File                                             | Change type | FR               | Description                                                                      |
| ------------------------------------------------ | ----------- | ---------------- | -------------------------------------------------------------------------------- |
| `extensions/constants.ts`                        | Modify      | FR-1, FR-2       | Add `CONFIG_PATH`, `MORPH_COMMAND`, `SUBCOMMANDS`.                               |
| `extensions/state.ts`                            | New         | FR-2, FR-3, FR-4 | Singleton module state with config, resolvedApiKey cache.                        |
| `extensions/config.ts`                           | New         | FR-2, FR-3       | `loadConfig`, `saveConfig`, `normalizeConfig`; JSON + chmod 0600.                |
| `extensions/ui.ts`                               | New         | FR-2             | `openMorphSettingsPanel()` using `SettingsList`; `summarizeConfig()`.            |
| `extensions/commands.ts`                         | Modify      | FR-1, FR-5       | Consolidate into `/morph [subcommand]`; remove old `/morph-*` registrations.     |
| `extensions/index.ts`                            | Modify      | FR-1, FR-4       | Register `/morph` only; add `session_start` lifecycle for 1Password key restore. |
| `extensions/auth.ts`                             | Modify      | FR-4, FR-5       | Extend `ensureMorphApiKey()` to check 1Password source.                          |
| `extensions/credentials/token-source.ts`         | New         | FR-4             | Resolve OP service account token.                                                |
| `extensions/credentials/onepassword-storage.ts`  | New         | FR-4, FR-5       | Read/write Morph API key to adapter-owned 1Password item.                        |
| `~/workspace/victor/pi-ecosystem/pi-components/` | New repo    | FR-6             | `ChecklistPanel`, `createBorderedWidget`, actions and types.                     |
| `package.json`                                   | Modify      | FR-6             | Add `@victor-software-house/pi-components` dependency.                           |

---

## 10. Dependencies & Constraints

* Requires `@1password/sdk` (same version as `pi-anthropic-adapter`).
* Requires Pi `SettingsList` from `@earendil-works/pi-tui`.
* Requires `@1password/sdk` resolution from `OP_SERVICE_ACCOUNT_TOKEN` env or `fnox get OP_SERVICE_ACCOUNT_TOKEN`.
* `pi-components` must be published and available at the `@victor-software-house` GitHub Packages registry before depending on it.
* `pi-components` must not import any sensitive or Pi-platform-specific code — only `@earendil-works/pi-tui` primitives.

---

## 11. Rollout Plan

1. **Phase 1 — pi-components package** (new repo + publish).
   * Create `~/workspace/victor/pi-ecosystem/pi-components/` package.
   * Port `ChecklistPanel`, `createBorderedWidget`, `createChecklistAction`, `describeChecklistActions`.
   * Publish `@victor-software-house/pi-components@0.1.0`.
2. **Phase 2 — pi-fast-apply config refactor** (this PRD).
   * Add `extensions/state.ts`, `extensions/config.ts`, `extensions/ui.ts`.
   * Add `extensions/credentials/` (token-source + onepassword-storage).
   * Refactor `extensions/commands.ts` and `extensions/index.ts`.
   * Update `package.json` to depend on `pi-components`.
3. **Phase 3 — pi-anthropic-adapter migration** (separate PR).
   * Update adapter to import from `@victor-software-house/pi-components`.
   * Remove local `~/.pi/agent/lib/pi-components/`.
4. **Phase 4 — verification**.
   * Live `/morph` pane test.
   * 1Password key round-trip.
   * Existing `MORPH_API_KEY` env var still works.
   * Gate passes.

---

## 12. Open Questions

| #  | Question                                                                                                            | Owner                 | Due            | Status |
| -- | ------------------------------------------------------------------------------------------------------------------- | --------------------- | -------------- | ------ |
| Q1 | Which `@1password/sdk` version to pin for pi-fast-apply?                                                            | Victor Software House | Before Phase 2 | Open   |
| Q2 | Should 1Password item title include a package identifier (`Pi Morph Adapter`) distinct from `Pi Anthropic Adapter`? | Victor Software House | Before Phase 2 | Open   |
| Q3 | Should `pi-components` also export `SettingsList` patterns or only `ChecklistPanel` + `BorderedWidget`?             | Victor Software House | Before Phase 1 | Open   |
| Q4 | Should `extensions/credentials/` be extracted into a shared Pi credential helper package in this scope or deferred? | Victor Software House | Before Phase 2 | Open   |

---

## 13. Related

| Issue                                                                                              | Relationship                                                                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [PRD-001 Morph Runtime Integration](PRD-001-morph-runtime-integration.md)                          | Source plan; ADR-0003 covers Pi auth storage for Morph secrets                       |
| [ADR-0003 Pi auth storage for Morph secrets](../adr/ADR-0003-pi-auth-storage-for-morph-secrets.md) | Existing ADR; 1Password mode extends this contract                                   |
| [PRD-002 WarpGrep SDK Flexibility](PRD-002-warpgrep-sdk-flexibility.md)                            | Config pane will expose new WarpGrep options (includes/excludes/searchType defaults) |

---

## 14. Changelog

| Date       | Change        | Author                |
| ---------- | ------------- | --------------------- |
| 2026-05-17 | Initial draft | Victor Software House |
