---
title: "Morph Runtime Integration"
prd: PRD-001
status: Draft
owner: "Victor Software House"
issue: "N/A"
date: 2026-05-15
version: "1.0"
---

# PRD: Morph Runtime Integration

---

## 1. Problem & Context

`pi-fast-apply` currently exposes one high-value Morph capability: a Pi-native `fast_apply` model-facing tool backed by `@morphllm/morphsdk` `applyEdit()`. The current implementation deliberately keeps file reads, writes, path resolution, dry-run behavior, mutation queueing, validation, and rendering inside Pi while using Morph only for the semantic merge step.

That foundation is sound, but the package now has three gaps:

1. **Runtime confidence gap** — `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, and `pnpm run build` pass, but `pnpm run test` currently has no test files and none of those checks prove that the installed Pi runtime can import the extension, resolve Morph credentials, reach the Morph API, or execute a real merge.
2. **Hidden behavior gap** — the SDK currently defaults Fast Apply to `morph-v3-large` unless `MORPH_LARGE_APPLY=false`; the package does not expose or report that choice, so operator cost/quality behavior is implicit.
3. **Broader Morph gap** — current docs and research show Morph also provides WarpGrep, public GitHub search, Compact, and Router. The repo's old roadmap captured those ideas with ad hoc phase codes, but no durable PRD, implementation plan, or ADRs exist under `docs/prd`, `docs/architecture`, or `docs/adr`.

This PRD replaces ad hoc roadmap planning with specdocs-first planning before more implementation. It keeps `fast_apply` stable, adds a human-facing `/morph-probe` verification path, and defines how broader Morph capabilities should enter Pi without bloating the model-visible tool surface or weakening Pi ownership of safety-critical behavior.

---

## 2. Goals & Success Metrics

| Goal                                          | Metric                                                                                              | Target                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Live runtime verification**                 | `/morph-probe` can classify SDK, auth, network, Compact, and Fast Apply health in a real Pi session | Command reports pass/fail/skip for each check with actionable failure text                                                |
| **Explicit Fast Apply model behavior**        | Operator can inspect and configure Fast Apply model tier                                            | `/morph-status` reports the active tier; `fast_apply` passes explicit SDK config instead of relying on hidden SDK default |
| **Context-efficient Morph expansion**         | New Morph capabilities do not all become always-on model-facing tools                               | Baseline model-visible surface stays small; specialist tools activate only when needed or by explicit command/tool flow   |
| **Pi-owned safety boundary**                  | Morph never owns local file writes or secret persistence                                            | All file mutation remains behind Pi mutation queue; Morph keys resolve through Pi auth/env chain only                     |
| **Specdocs replacement for roadmap planning** | Future implementation slices are traceable through specdocs                                         | PRD, plan, and ADRs exist and use named requirements/workstreams instead of ad hoc phase codes                            |

**Guardrails (must not regress):**

* `fast_apply` remains a native Pi tool named `fast_apply`; existing prompt habits and transcripts must continue to work.
* `fast_apply` continues refusing new-file creation; users must use `write` for new files.
* Pi continues validating empty merge output and leaked `// ... existing code ...` markers before any write.
* `dryRun` continues showing merged diff without writing the target file.
* `/morph-login`, `/morph-logout`, and `/morph-status` remain stable operator commands.
* No feature writes plaintext Morph keys to project config or global JSON config outside Pi auth storage.

---

## 3. Users & Use Cases

### Primary: Pi operator using Morph-backed editing

> As a Pi operator, I want to verify Morph integration in my current runtime so that I know failures come from config, auth, network, SDK drift, or implementation bugs before trusting edits.

**Preconditions:** Pi has loaded the package extension; either Pi auth storage or `MORPH_API_KEY` may provide credentials.

### Primary: Model using Pi-native code tools

> As the model inside Pi, I want a small set of clear Morph tools so that I can use semantic editing/search/compaction when they are better than native tools without receiving a giant tool manual every turn.

**Preconditions:** The extension has registered baseline tools and any hidden specialist family has a discoverable activation path.

### Secondary: Package maintainer

> As maintainer, I want implementation work ordered through specdocs so that feature scope, durable decisions, verification, and release risks are explicit before code changes.

**Preconditions:** Repo docs and current extension code are available; no existing PRD/plan/ADR conflicts with this work.

### Future: Pi operator using broader Morph suite

> As a Pi operator, I want local code search, public GitHub search, and context compaction through Morph so that long coding sessions stay faster, cheaper, and less noisy.

**Preconditions:** Broader tools ship behind progressive disclosure, with `/morph-probe` able to show which checks are implemented, skipped, or failing.

---

## 4. Scope

### In scope

1. **Specdocs foundation** — create PRD, implementation plan, and ADRs for the Morph runtime integration direction.
2. **Morph probe command** — add `/morph-probe` as an operator-facing live runtime smoke test.
3. **Fast Apply model control** — make Fast Apply model tier explicit in config, status output, probe output, and SDK call config.
4. **WarpGrep local search design** — define how local Morph search enters Pi as a specialist capability without exposing excessive schema/prompt text by default.
5. **Public GitHub search design** — define public repo search scope, validation, and failure behavior.
6. **Compact hook design** — define `session_before_compact` and optional `tool_result` compaction boundaries.
7. **Progressive disclosure design** — define active-tool policy for Morph tool families using current Pi `setActiveTools()` behavior.
8. **Auth/config constraints** — keep secrets in Pi auth storage or env fallback; avoid global config auto-creation and auto-mutation.
9. **Future package rename path** — capture rename constraints without renaming now.

### Out of scope / later

| What                                                    | Why                                                                                                                  | Tracked in                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Package rename to a broader Morph name                  | Rename is only justified after more than Fast Apply ships; package name and GitHub Packages versions are sticky      | This PRD, future release plan |
| Private GitHub repository search                        | Morph public docs and current research support public repo search; private auth model needs separate security review | Future PRD or ADR             |
| MorphGit-backed persistent indexing                     | Adds hosted repo/index state and weakens local-first boundary; WarpGrep is lower-friction for this package           | Future PRD if needed          |
| Embeddings/rerank, browser/computer use, Vibe artifacts | Not relevant to current Pi terminal coding-agent package                                                             | Deferred                      |
| Automatic global AGENTS.md edits                        | High blast radius; user/project context must remain operator-owned                                                   | Explicitly excluded           |
| Full test suite for every future Morph tool             | This PRD requires probe and basic automated seams first; each tool adds focused tests as implemented                 | Plan workstreams              |

### Design for future (build with awareness)

The extension should evolve from one tool into a small Morph family without becoming a context tax. Future-ready code means:

* shared Morph client/auth/config helpers instead of one-off env reads per feature;
* command family shape that can grow from `/morph-status` and `/morph-probe` into `/morph settings` later if needed;
* typed result details for renderers and probe checks;
* tool family activation state derived from named families, not hard-coded one-off active tool lists;
* docs that describe capabilities by requirement names and workstreams, not roadmap phase codes.

---

## 5. Functional Requirements

### REQ-001: Fast Apply remains Pi-owned for file I/O

Morph must continue receiving original code and lazy edit snippets only. Pi must own path expansion, file existence checks, marker validation, mutation queueing, dry-run behavior, writes, and operator rendering.

**Acceptance criteria:**

```gherkin
Given an existing file at src/example.ts and valid Morph credentials
When the model calls fast_apply with dryRun false
Then Pi reads src/example.ts locally, sends originalCode and codeEdit to Morph, validates mergedCode, and writes through withFileMutationQueue
```

```gherkin
Given a missing target file at src/new-file.ts
When the model calls fast_apply
Then the tool fails with guidance to use write and no file is created by Morph
```

**Files:**

* `extensions/index.ts` — preserve code-in/code-out `applyEdit()` flow and safety validation.
* `README.md` — keep tool contract explicit for users.

### REQ-002: Fast Apply exposes explicit model selection

The extension must stop relying on hidden SDK default model-tier behavior. It must expose the selected tier to operators and pass the tier explicitly to Morph SDK config.

**Acceptance criteria:**

```gherkin
Given no model-tier override is configured
When the operator runs /morph-status
Then the output shows the active Fast Apply model tier and its source as default
```

```gherkin
Given MORPH_APPLY_MODEL=fast
When fast_apply executes
Then buildApplyConfig passes large: false to applyEdit
```

```gherkin
Given MORPH_APPLY_MODEL=large
When fast_apply executes
Then buildApplyConfig passes large: true to applyEdit
```

**Files:**

* `extensions/index.ts` — add model-tier parsing, status output, probe output, and explicit `large` config.
* `README.md` — document `MORPH_APPLY_MODEL` or final chosen config name.
* `docs/morph-api-reference.md` — keep SDK default warning current.

### REQ-003: Morph probe verifies live runtime health

The extension must add `/morph-probe` as a human-facing command that checks real runtime health without being exposed as a model-facing tool.

**Acceptance criteria:**

```gherkin
Given Morph credentials are missing
When the operator runs /morph-probe
Then the command reports API key: missing and suggests /morph-login or MORPH_API_KEY without attempting edit calls
```

```gherkin
Given valid Morph credentials and network access
When the operator runs /morph-probe
Then the command reports SDK import, auth source, API base URL, Compact probe, and Fast Apply probe status
```

```gherkin
Given WarpGrep is not implemented yet
When the operator runs /morph-probe
Then the command reports WarpGrep local and GitHub search as skipped, not failed
```

**Files:**

* `extensions/index.ts` — register `/morph-probe`, implement probe runner, classify failures.
* `README.md` — document probe purpose and sample output.
* `docs/architecture/plan-morph-runtime-integration.md` — sequence probe before broader tools.

### REQ-004: WarpGrep provides isolated local codebase search

The extension must add local codebase search through Morph WarpGrep only after baseline verification and progressive disclosure decisions are in place.

**Acceptance criteria:**

```gherkin
Given a repository root and valid Morph credentials
When the model enables Morph search and calls the local search tool with searchTerm "Find auth middleware"
Then the tool returns bounded file:line context without exposing intermediate grep attempts to the main model
```

```gherkin
Given the search term is an exact string lookup
When the model considers using Morph local search
Then the tool metadata or activation guidance directs it to native grep/find instead
```

**Files:**

* `extensions/index.ts` or future split module under `extensions/` — add local search tool and activation flow.
* `README.md` — document when to use local Morph search versus native grep.
* `docs/morph-api-reference.md` — keep SDK/direct protocol notes updated.

### REQ-005: GitHub search uses Morph WarpGrep for public repos

The extension must support public GitHub repository search through Morph only after local search foundations exist.

**Acceptance criteria:**

```gherkin
Given input github "vercel/next.js" and searchTerm "Find route handlers"
When the model calls the GitHub search tool
Then the tool validates the repo identifier shape and returns Morph result contexts for the default or requested branch
```

```gherkin
Given input github points to a private or missing repository
When the model calls the GitHub search tool
Then the tool fails with a clear public-repo limitation or not-found message and does not request extra secrets
```

**Files:**

* `extensions/index.ts` or future split module under `extensions/` — add public GitHub search tool and repo validation.
* `README.md` — document public-only scope.

### REQ-006: Compact integrates with session\_before\_compact

The extension must support explicit session compaction through Pi's current `session_before_compact` event, with Morph Compact as an optional replacement for default compaction when configured and healthy.

**Acceptance criteria:**

```gherkin
Given Morph credentials are configured and Compact is enabled
When Pi triggers session compaction
Then the extension calls Morph Compact with query derived from recent user intent and preserveRecent at least 3
```

```gherkin
Given Morph credentials are missing or Compact fails
When Pi triggers session compaction
Then the extension falls back to Pi default compaction and reports an actionable diagnostic when appropriate
```

**Files:**

* `extensions/index.ts` or future compact module — register `session_before_compact` handler.
* `docs/compact-interception.md` — remain source design doc for compaction behavior.
* `README.md` — document Compact config.

### REQ-007: Optional tool\_result compaction reduces large tool outputs

The extension may add automatic per-tool-result compaction after explicit compaction works, but it must be conservative and configurable.

**Acceptance criteria:**

```gherkin
Given automatic tool result compaction is enabled and a read result exceeds the configured threshold
When tool_result fires for that output
Then Morph Compact may replace model-facing content with verbatim surviving lines and details include token/line reduction stats
```

```gherkin
Given a tool result is from fast_apply, edit, write, or another mutation-oriented tool
When tool_result fires
Then automatic compaction skips it by default
```

**Files:**

* `extensions/index.ts` or future compact module — register conservative `tool_result` handler.
* `docs/compact-interception.md` — document skip rules and config.

### REQ-008: Morph tools use progressive disclosure

Broader Morph tools must not all be always active by default. The model-visible surface must remain small, using Pi's active tool controls or a comparable mechanism.

**Acceptance criteria:**

```gherkin
Given a new Pi session
When the model-visible tool list is built
Then fast_apply remains available and specialist Morph search tools are hidden or represented only by a small activator surface
```

```gherkin
Given the model activates the Morph search family
When the next agent turn starts
Then local and GitHub search tools are visible and their activator is removed from the active set
```

**Files:**

* `extensions/index.ts` or future activation module — implement family activation, restoration, and reset policy.
* `README.md` — explain discoverability without always-on bloat.

### REQ-009: Config avoids global runtime mutation

The extension must avoid auto-creating global config files, auto-editing user AGENTS.md, or persisting secrets outside Pi auth storage unless the operator explicitly requests a future config command.

**Acceptance criteria:**

```gherkin
Given the extension loads in a fresh Pi install
When no Morph config exists
Then extension startup does not create config files or modify AGENTS.md
```

```gherkin
Given the operator runs /morph-login <key>
When credentials are stored
Then storage uses Pi auth storage under the existing Morph provider id
```

**Files:**

* `extensions/index.ts` — keep config and auth resolution request-scoped.
* `README.md` — document env/auth behavior without suggesting plaintext config.

### REQ-010: Future rename path preserves package users

If the package later expands beyond Fast Apply, the rename must preserve installed-user expectations and release safety.

**Acceptance criteria:**

```gherkin
Given only fast_apply and probe are shipped
When considering a package rename
Then the rename is deferred because the package is still primarily Fast Apply
```

```gherkin
Given local search, GitHub search, Compact, and probe are shipped
When considering a package rename
Then a migration plan covers npm package naming, GitHub repository naming, README, changelog, and compatibility messaging before release
```

**Files:**

* `package.json` — future package metadata only when rename is approved.
* `README.md` — future migration notice.
* `CHANGELOG.md` — future release note if changelog is added.

---

## 6. Non-Functional Requirements

| Category               | Requirement                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Safety**             | Morph must not write directly to user files; all writes remain behind Pi validation and mutation queueing.                            |
| **Security**           | Morph API keys must resolve from Pi auth storage or `MORPH_API_KEY`; no new plaintext project/global config may store secrets.        |
| **Context efficiency** | New model-facing Morph tool metadata must be minimized; specialist tools must use progressive disclosure unless proven always-needed. |
| **Observability**      | Probe, status, and tool results must identify config source, model tier, skip/fail/pass state, and actionable remediation.            |
| **Reliability**        | A Morph API outage must fail the Morph feature with clear errors and must not corrupt files or block unrelated Pi behavior.           |
| **Compatibility**      | Existing `fast_apply`, `/morph-login`, `/morph-logout`, and `/morph-status` behavior must remain backward compatible.                 |
| **Maintainability**    | Shared config/auth/client helpers should prevent duplicated env parsing and SDK setup as features grow.                               |

---

## 7. Risks & Assumptions

### Risks

| Risk                                                          | Severity | Likelihood | Mitigation                                                                                                                                                 |
| ------------------------------------------------------------- | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Probe mutates user files or leaves temp state                 | High     | Low        | Run probe in a temp dir/file only; clean up; label writes as temp-only; skip user project mutation.                                                        |
| Compact drops critical context                                | High     | Medium     | Start with explicit `session_before_compact`; make `tool_result` compaction opt-in/conservative; preserve recent turns; skip edit-target/mutation outputs. |
| Tool surface bloat hurts every Pi turn                        | Medium   | High       | Keep `fast_apply` baseline; gate search family behind activation or explicit operator control; validate active tool prompt impact before release.          |
| Hidden SDK/API drift breaks runtime despite passing typecheck | Medium   | Medium     | `/morph-probe` classifies SDK import/API/auth/network failures; add automated seams around config and probe where practical.                               |
| Model-tier config changes edit quality or cost unexpectedly   | Medium   | Medium     | Keep default compatible with current behavior, show tier in `/morph-status` and probe, document env/source clearly.                                        |
| Public GitHub search users expect private repo support        | Medium   | Medium     | Document public-only scope; fail clearly; require separate ADR/security review for private auth.                                                           |
| Rename burns package/repo expectations                        | Medium   | Medium     | Defer rename until broader capability exists; create release migration plan before metadata changes.                                                       |

### Assumptions

* Current Pi extension APIs include `pi.registerTool()`, `pi.registerCommand()`, `pi.on("tool_result")`, `pi.on("session_before_compact")`, and `pi.setActiveTools()`.
* Current Morph SDK version remains `@morphllm/morphsdk@0.2.171` during the first implementation slice.
* `applyEdit()` continues supporting `large?: boolean`, `generateUdiff?: boolean`, and code-in/code-out operation.
* Public GitHub search is acceptable for public repos only until Morph docs and repo policy define a private-repo auth model.
* The package stays TypeScript-only, ESM, Node >=24, pnpm 11, Biome + oxlint.

---

## 8. Design Decisions

### D1: Keep Pi-owned file mutation for Fast Apply

**Options considered:**

1. SDK high-level `morph.fastApply.execute({ autoWrite: true })` — less local code, but Morph/SDK owns writes and weakens Pi dry-run/mutation queue guarantees.
2. SDK low-level `applyEdit()` code-in/code-out — more local code, but Pi keeps full safety and UX control.

**Decision:** Continue using low-level `applyEdit()` for `fast_apply`.

**Rationale:** This preserves existing behavior and keeps all safety-critical file operations inside Pi.

**Future path:** If future SDK APIs expose more metadata, Pi can still consume them without changing the ownership boundary.

### D2: Use `/morph-probe` as operator command, not model tool

**Options considered:**

1. Model-facing diagnostic tool — callable by the model, but adds schema/context overhead every turn.
2. Slash command `/morph-probe` — discoverable to operator, zero model-visible cost unless invoked manually.

**Decision:** Implement `/morph-probe` as an operator command.

**Rationale:** Runtime verification is primarily a human trust/recovery workflow, not something the model needs to call repeatedly.

**Future path:** Probe output can later include implemented/skipped checks for each Morph capability.

### D3: Specialist Morph tools require progressive disclosure

**Options considered:**

1. Always expose `fast_apply`, local search, GitHub search, Compact controls, Router controls, and future tools.
2. Keep only baseline tool(s) visible and expose specialist families through small activation/control surfaces.

**Decision:** Keep baseline small and use progressive disclosure for Morph search and other specialist model tools.

**Rationale:** Pi sends active tool names, descriptions, schemas, snippets, and guidelines to providers. Always-on Morph family tools would tax unrelated turns.

**Future path:** The implementation plan will define exact activation/reset behavior; an ADR will record the durable decision.

### D4: Pi auth storage and env fallback remain the only secret sources

**Options considered:**

1. Add Morph-specific JSON config with key storage and key rotation.
2. Use Pi auth storage via `/morph-login`, falling back to `MORPH_API_KEY`.

**Decision:** Keep Pi auth storage plus env fallback as the only Morph secret sources for this work.

**Rationale:** This matches current package behavior, avoids plaintext config sprawl, and handles env-stripped Pi launches better than shell-only auth.

**Future path:** Non-secret settings may later move to a settings controller or command family; secrets still stay in Pi auth/env.

### D5: Defer package rename until broader Morph coverage ships

**Options considered:**

1. Rename now to a broad Morph package name.
2. Keep `pi-fast-apply` until shipped behavior materially exceeds Fast Apply.

**Decision:** Defer rename.

**Rationale:** Current public capability is still Fast Apply. Renaming before broader tools exist creates churn without user-visible payoff.

**Future path:** Rename becomes eligible after local search, GitHub search, Compact, and probe are implemented and documented.

---

## 9. File Breakdown

| File                                                                | Change type   | FR                                                   | Description                                                                     |
| ------------------------------------------------------------------- | ------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| `docs/prd/PRD-001-morph-runtime-integration.md`                     | New           | All                                                  | Source PRD for Morph runtime integration scope and requirements.                |
| `docs/architecture/plan-morph-runtime-integration.md`               | New           | All                                                  | Implementation sequencing, components, risks, and ADR index.                    |
| `docs/adr/ADR-0001-pi-owned-file-mutation-for-morph-apply.md`       | New           | REQ-001                                              | Records Fast Apply ownership boundary.                                          |
| `docs/adr/ADR-0002-progressive-disclosure-for-morph-tool-family.md` | New           | REQ-004, REQ-005, REQ-008                            | Records tool activation/context strategy.                                       |
| `docs/adr/ADR-0003-pi-auth-storage-for-morph-secrets.md`            | New           | REQ-009                                              | Records secret storage/config decision.                                         |
| `extensions/index.ts`                                               | Modify        | REQ-002, REQ-003                                     | Add explicit model tier and `/morph-probe`; later split if file grows.          |
| `extensions/index.ts` or future `extensions/morph-search.ts`        | Modify/New    | REQ-004, REQ-005, REQ-008                            | Add local/public search tools and activation flow.                              |
| `extensions/index.ts` or future `extensions/morph-compact.ts`       | Modify/New    | REQ-006, REQ-007                                     | Add Compact hooks and skip policy.                                              |
| `README.md`                                                         | Modify        | REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-009 | Update docs for probe, config, search, compaction, auth constraints.            |
| `docs/morph-api-reference.md`                                       | Modify        | REQ-002, REQ-004, REQ-005, REQ-006                   | Keep current SDK/API notes aligned with implementation.                         |
| `docs/compact-interception.md`                                      | Modify        | REQ-006, REQ-007                                     | Keep Compact hook details and skip rules current.                               |
| `ROADMAP.md`                                                        | Modify/Delete | All                                                  | Replace ad hoc roadmap codes with pointers to specdocs after plan/ADR adoption. |
| `package.json`                                                      | Modify later  | REQ-010                                              | Rename only in future approved migration.                                       |

---

## 10. Dependencies & Constraints

* `@morphllm/morphsdk@^0.2.171` is current dependency for Morph APIs.
* Pi extension imports must use `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`, not legacy package names.
* Current package is `@victor-software-house/pi-fast-apply`; rename is out of scope for first implementation.
* Runtime target: Node >=24, ESM TypeScript, pnpm 11.
* Verification gate before commits remains:
  * `pnpm run typecheck`
  * `pnpm run lint`
  * `pnpm run test`
  * `pnpm run build`
* `pnpm peers check` currently warns about `openai@4.104.0` wanting Zod 3 via Morph SDK; implementation must not mask this unless upstream/dependency strategy changes.
* Specdocs validation should run after writing/updating PRD, plan, or ADR docs.

---

## 11. Rollout Plan

1. **Specdocs foundation** — land PRD, implementation plan, and ADRs before changing runtime behavior.
2. **Probe and explicit model tier** — implement `/morph-probe` and explicit Fast Apply tier config first because they de-risk every later Morph feature.
3. **Search family activation** — add progressive disclosure state/activation before exposing local or GitHub search tools.
4. **Local WarpGrep search** — implement local search with bounded results and probe coverage.
5. **Public GitHub search** — add public repo search after local search output contracts are stable.
6. **Explicit Compact hook** — add `session_before_compact` integration with safe fallback.
7. **Optional automatic tool result compaction** — add conservative `tool_result` compression only after explicit Compact behavior is proven.
8. **Roadmap cleanup** — replace old roadmap phase codes with specdocs links and named workstreams.
9. **Rename evaluation** — only after broader capabilities ship and release migration is planned.

---

## 12. Open Questions

| #  | Question                                                                                                            | Owner      | Due                           | Status                                                                                   |
| -- | ------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| Q1 | Should Fast Apply default remain SDK-equivalent `large`, or switch default to `fast` for cost?                      | Maintainer | Before REQ-002 implementation | **Resolved:** Preserve current effective behavior by default; expose config for changes. |
| Q2 | Should Morph search activation be model-triggered through a tiny tool, operator-triggered through command, or both? | Maintainer | Before REQ-008 implementation | Open                                                                                     |
| Q3 | Should automatic `tool_result` compaction default on or off?                                                        | Maintainer | Before REQ-007 implementation | **Resolved:** Default conservative/off until explicit session compaction proves safe.    |
| Q4 | Should future code split `extensions/index.ts` into modules before adding search/compact?                           | Maintainer | During plan workstream 1      | Open                                                                                     |

---

## 13. Related

| Issue                          | Relationship                                                           |
| ------------------------------ | ---------------------------------------------------------------------- |
| N/A                            | Original local specdocs planning work, not tied to tracker issue.      |
| `docs/morph-api-reference.md`  | Provides current Morph SDK/API evidence.                               |
| `docs/compact-interception.md` | Provides current Compact hook design.                                  |
| `ROADMAP.md`                   | Legacy planning artifact to replace or reduce after specdocs adoption. |

---

## 14. Changelog

| Date       | Change        | Author                |
| ---------- | ------------- | --------------------- |
| 2026-05-15 | Initial draft | Victor Software House |

### Creation provenance

| Field                 | Value                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Created in Pi session | `019e2e39-246e-77dc-8b1e-90b3f17e48b1`                                                                                                                              |
| Session file          | `/Users/victor/.pi/agent/sessions/--Users-victor-workspace-victor-pi-ecosystem-pi-fast-apply--/2026-05-16T00-39-17-359Z_019e2e39-246e-77dc-8b1e-90b3f17e48b1.jsonl` |
| Session name          | Morph Runtime Integration Specdocs                                                                                                                                  |
| Created               | 2026-05-15 BRT                                                                                                                                                      |

---

## 15. Verification (Appendix)

Post-implementation checklist:

1. Run `pnpm run typecheck && pnpm run lint && pnpm run test && pnpm run build`.
2. Run `/morph-status` in a Pi session with no key and confirm missing-auth output is actionable.
3. Run `/morph-probe` with no key and confirm checks fail/skip without network calls that require auth.
4. Run `/morph-login <test-key>` in a Pi session, then `/morph-probe`; confirm SDK/auth/API/Fast Apply checks pass or fail with classified reasons.
5. Run `fast_apply` dry-run against a temp fixture and verify no target write.
6. Run `fast_apply` non-dry against a temp fixture and verify merge output, diff stats, and mutation cleanup.
7. After search ships, run local search against this repo for `resolveMorphApiKey` and confirm returned contexts include `extensions/index.ts`.
8. After GitHub search ships, run public search against a known public repo and confirm public-only behavior is documented.
9. After Compact ships, trigger session compaction and confirm fallback behavior when Morph credentials are removed.
