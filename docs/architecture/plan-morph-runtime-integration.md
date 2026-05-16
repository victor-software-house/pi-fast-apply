---
title: "Morph Runtime Integration"
prd: "PRD-001-morph-runtime-integration"
date: 2026-05-15
author: "Victor Software House"
status: Draft
---

# Plan: Morph Runtime Integration

## Source

* **PRD**: [docs/prd/PRD-001-morph-runtime-integration.md](../prd/PRD-001-morph-runtime-integration.md)
* **Date**: 2026-05-15
* **Author**: Victor Software House

## Architecture Overview

`pi-fast-apply` should grow from a single Fast Apply tool into a small Morph runtime integration while preserving Pi as the owning runtime. Pi remains responsible for local filesystem access, mutation queueing, auth resolution, command UX, model-visible tool activation, and operator rendering. Morph remains the semantic service used for merge, search, compact, and optional routing decisions.

The first implementation workstream should not add search or compaction. It should make the current runtime observable and explicit: add `/morph-probe`, factor shared Morph config/auth helpers, and pass explicit Fast Apply model-tier config into `applyEdit()`. That creates a safe verification surface before additional Morph API calls enter the package.

Broader capabilities should be added as specialist families. `fast_apply` remains the baseline always-visible tool because editing is the package's current core value. Local WarpGrep and GitHub search should use progressive disclosure so their schemas, descriptions, prompt snippets, and guidelines do not tax unrelated turns. Compact has two paths: explicit session compaction through `session_before_compact` first, then optional conservative `tool_result` compaction after real behavior is proven.

## Components

### Specdocs Foundation

**Purpose**: Replace ad hoc roadmap planning with durable PRD, plan, and ADRs.

**Key Details**:

* Source PRD: [PRD-001](../prd/PRD-001-morph-runtime-integration.md).
* This plan defines workstreams and dependencies before runtime edits.
* ADRs record lasting architectural constraints so future package rename/search/compact work does not re-litigate basics.

**ADR Reference**: This plan introduces ADRs listed in [ADR Index](#adr-index).

### Morph Runtime Core

**Purpose**: Centralize auth/config/client behavior shared by Fast Apply, probe, search, and Compact.

**Key Details**:

* Keep existing auth priority: Pi auth storage provider id `morph`, then `MORPH_API_KEY` env fallback.
* Keep `MORPH_API_URL` and `MORPH_EDIT_TIMEOUT_MS`; add explicit Fast Apply tier config such as `MORPH_APPLY_MODEL=large|fast`.
* Avoid global config auto-creation and avoid secret persistence outside Pi auth/env.
* Consider extracting helpers from `extensions/index.ts` only if the first runtime slice becomes hard to review.

**ADR Reference**: [ADR-0003](../adr/ADR-0003-pi-auth-storage-for-morph-secrets.md): Pi auth storage for Morph secrets.

### Fast Apply Model Control

**Purpose**: Preserve existing Fast Apply behavior while making model tier explicit and visible.

**Key Details**:

* `buildApplyConfig()` should pass `large: true|false` explicitly.
* Default should preserve current effective SDK behavior: `large` unless config says `fast`.
* `/morph-status`, `/morph-probe`, and `fast_apply` result `details` should include selected tier and source.
* Invalid config should not silently choose a surprising model; report default/fallback clearly.

**ADR Reference**: [ADR-0001](../adr/ADR-0001-pi-owned-file-mutation-for-morph-apply.md): Pi-owned file mutation for Morph Apply.

### Morph Probe Command

**Purpose**: Provide live runtime smoke test for operator trust and dependency/API drift detection.

**Key Details**:

* Register `/morph-probe` as an operator command, not a model-facing tool.
* Checks should classify: SDK import/version, auth source, API base URL, timeout/model config, Compact probe, Fast Apply temp-file probe, and skipped future checks.
* Use temp directory/files only. Never mutate project files.
* Missing auth should produce actionable output and skip auth-required probes.
* Later tools extend probe with WarpGrep local and GitHub checks.

**ADR Reference**: None — command shape is implementation detail; operator-vs-model diagnostic decision is captured in PRD design decisions.

### Morph Search Family

**Purpose**: Add local and public GitHub semantic code search through WarpGrep without bloating baseline model context.

**Key Details**:

* Prefer high-level SDK `morph.warpGrep.execute({ searchTerm, repoRoot })` for first local implementation.
* Drop to direct protocol only if high-level SDK prevents required rendering, cancellation, or bounded output.
* GitHub search should use `morph.warpGrep.searchGitHub({ searchTerm, github, branch })` and stay public-only initially.
* Tool output should return bounded file:line contexts. Intermediate search attempts should remain inside WarpGrep's isolated context.
* Search tools should distinguish semantic/broad search from exact keyword lookup; exact lookup stays native grep/find.

**ADR Reference**: [ADR-0002](../adr/ADR-0002-progressive-disclosure-for-morph-tool-family.md): Progressive disclosure for Morph tool family.

### Progressive Disclosure Controller

**Purpose**: Keep Morph specialist tools inactive until needed while preserving discoverability.

**Key Details**:

* Keep `fast_apply` always visible for backward compatibility and current package purpose.
* Add a minimal activation/control path for Morph search family before registering full search tools as active.
* Use `pi.setActiveTools()` and session-local state if model-triggered activation is implemented.
* Restore state on `session_start`/`session_tree`; reset on new session and compaction unless the ADR chooses otherwise.
* Validate provider-visible prompt/tool impact before shipping expanded tool metadata.

**ADR Reference**: [ADR-0002](../adr/ADR-0002-progressive-disclosure-for-morph-tool-family.md): Progressive disclosure for Morph tool family.

### Morph Compact Hooks

**Purpose**: Integrate Morph Compact in Pi lifecycle where it reduces actual model context, not just rendering.

**Key Details**:

* First implement explicit compaction through `pi.on("session_before_compact", ...)`.
* Derive `query` from recent user intent; set `preserveRecent` at least 3 for conversation compaction.
* Fall back to Pi default compaction if Morph credentials are absent or API fails.
* Add optional `tool_result` compaction only after explicit compaction proves safe.
* `tool_result` compaction should default conservative/off, skip mutation tools, and put diagnostics in `details` plus operator output.

**ADR Reference**: None initially — current PRD and `docs/compact-interception.md` are enough unless default-on automatic compaction is proposed later.

### Documentation and Release Surface

**Purpose**: Keep cold readers and package users aligned as capabilities grow.

**Key Details**:

* Update `README.md` with `/morph-probe`, model tier config, search/compact usage as features ship.
* Keep `docs/morph-api-reference.md` current with Morph SDK changes.
* Replace or reduce `ROADMAP.md` so it points to specdocs and no longer uses ad hoc phase codes as source of truth.
* Defer package rename until broader Morph capability ships and a release migration plan exists.

**ADR Reference**: Package rename does not need an ADR yet; it becomes ADR-worthy when rename is actively proposed.

## Implementation Order

| Phase | Component                         | Dependencies        | Estimated Scope |
| ----- | --------------------------------- | ------------------- | --------------- |
| 1     | Specdocs foundation               | None                | S               |
| 2     | Runtime core helper cleanup       | Phase 1             | S               |
| 3     | Morph probe command               | Phase 2             | M               |
| 4     | Fast Apply explicit model control | Phase 2             | S               |
| 5     | Progressive disclosure controller | Phase 1, Phase 2    | M               |
| 6     | Local WarpGrep search             | Phase 5             | M               |
| 7     | Public GitHub search              | Phase 6             | M               |
| 8     | Explicit Compact hook             | Phase 2, Phase 3    | M               |
| 9     | Optional tool\_result compaction  | Phase 8             | M/L             |
| 10    | Roadmap/specdocs cleanup          | Phase 1, ADRs       | S               |
| 11    | Rename evaluation                 | Phases 6-9 complete | M               |

### Phase 1: Specdocs foundation

**Outcome**: PRD, plan, and ADRs exist and validate.

**Tasks**:

* Create `docs/prd/PRD-001-morph-runtime-integration.md`.
* Create `docs/architecture/plan-morph-runtime-integration.md`.
* Create ADRs for file mutation ownership, progressive disclosure, and secret storage.
* Run `specdocs_format` and `specdocs_validate`.

**Verification**:

* Specdocs validation passes or known issues are documented.
* `git status --short` shows only intended docs/config changes.

### Phase 2: Runtime core helper cleanup

**Outcome**: Morph auth/config parsing is ready for more than Fast Apply.

**Tasks**:

* Factor `resolveMorphApiKey()`, `getMorphApiBaseUrl()`, timeout parsing, and future model-tier parsing into clear helper functions.
* Decide whether to keep helpers in `extensions/index.ts` for now or split into internal module(s).
* Add typed source labels for config values shown in status/probe.

**Verification**:

* `pnpm run typecheck`.
* Existing `/morph-status` behavior unchanged except new model-tier field if Phase 4 lands in same slice.

### Phase 3: Morph probe command

**Outcome**: `/morph-probe` gives actionable runtime health report.

**Tasks**:

* Add `pi.registerCommand('morph-probe', ...)`.
* Implement checks:
  * SDK package/version/import available.
  * auth source: `auth.json`, env, or none.
  * API base URL and timeout parse.
  * Fast Apply temp-file dry/non-project test.
  * Compact tiny API call if auth exists.
  * future checks reported as skipped.
* Classify failure causes: missing key, auth rejected, network/base URL, timeout, SDK import/API shape, merge validation.

**Verification**:

* Run unit-like helper tests if added.
* Manual Pi check with no key: `/morph-probe` reports missing key and skips auth-required probes.
* Manual Pi check with valid key: `/morph-probe` reports Compact and Fast Apply pass or clear external failure.

### Phase 4: Fast Apply explicit model control

**Outcome**: Fast Apply model tier is explicit, documented, and visible.

**Tasks**:

* Add `getMorphApplyModel()` parsing, likely values: `large` and `fast`.
* Preserve current effective default: `large`.
* Pass `large: selected === 'large'` in `buildApplyConfig()`.
* Show tier and source in `/morph-status` and `/morph-probe`.
* Put tier in `fast_apply` result `details` for renderer/debugging.

**Verification**:

* Helper tests for unset, `large`, `fast`, invalid values.
* Manual dry-run confirms no behavior regression.

### Phase 5: Progressive disclosure controller

**Outcome**: Morph specialist tools can be hidden/activated intentionally.

**Tasks**:

* Define Morph families: baseline edit, search, compact controls if needed.
* Decide activation surface for search: model-facing `morph_search_enable`, operator command, or both.
* Use `pi.setActiveTools()` for next-turn activation if model-triggered.
* Persist family state with `pi.appendEntry()` if activation must survive resume/tree.
* Reset on new session and compaction if chosen.
* Probe provider-visible prompt/tool state before release if possible.

**Verification**:

* New session: only baseline tools/activators visible.
* After activation: search tools visible next turn and activator removed.
* Resume/tree/fork behavior matches ADR.

### Phase 6: Local WarpGrep search

**Outcome**: Model can request broad semantic local search through Morph.

**Tasks**:

* Add local search tool in search family.
* Use high-level SDK first: `morph.warpGrep.execute({ searchTerm, repoRoot })`.
* Bound output size and format as file:line contexts.
* Add rendering for progress/result if SDK exposes steps; otherwise return concise status.
* Document exact-grep fallback to native tools.
* Add `/morph-probe` local search check after implementation.

**Verification**:

* Search this repo for `resolveMorphApiKey`; result references `extensions/index.ts`.
* Search broad term like `operator auth status`; output bounded and useful.
* Exact string guidance remains in tool metadata/docs.

### Phase 7: Public GitHub search

**Outcome**: Model can search public GitHub repos without cloning.

**Tasks**:

* Add GitHub search tool in search family.
* Accept `owner/repo` and full GitHub URL; normalize to `owner/repo`.
* Optional branch parameter.
* Validate malformed identifiers locally; treat 404/private as public-only failure.
* Add `/morph-probe` GitHub search check only if safe, cheap, and non-flaky; otherwise keep manual verification.

**Verification**:

* Search known public repo with branch omitted.
* Malformed repo input fails locally with clear message.
* Private/missing repo failure does not ask for extra secrets.

### Phase 8: Explicit Compact hook

**Outcome**: Manual/session compaction can use Morph Compact safely.

**Tasks**:

* Register `pi.on('session_before_compact', ...)`.
* Build compact input from Pi event shape after inspecting current types.
* Pass `query`, `compressionRatio`, `preserveRecent`, and `compressSystemMessages: false` where supported.
* Fallback to default compaction if disabled, missing key, or API failure.
* Add status/probe fields for compact config.

**Verification**:

* Trigger compaction in a test/manual Pi session with key and inspect reduction stats.
* Remove key and verify default compaction path still works.

### Phase 9: Optional tool\_result compaction

**Outcome**: Large model-facing tool outputs can be compacted before reaching the model when explicitly enabled.

**Tasks**:

* Add opt-in env/config flag and threshold.
* Register `pi.on('tool_result', ...)`.
* Skip mutation tools and small/structured outputs.
* Preserve or skip active edit-target reads conservatively.
* Put reduction stats in `details`; show concise operator diagnostic.

**Verification**:

* Large read/grep output is compacted when enabled.
* `fast_apply`, `edit`, `write`, and errors are skipped.
* Failures fall back to original content.

### Phase 10: Roadmap/specdocs cleanup

**Outcome**: Specdocs are source of truth.

**Tasks**:

* Replace `ROADMAP.md` content with a short specdocs index or remove if README links suffice.
* Link README development section to PRD/plan/ADR docs.
* Ensure no ad hoc roadmap phase codes remain as source of truth.

**Verification**:

* `rg` for old roadmap code pattern returns none outside historical git.
* Docs links resolve locally.

### Phase 11: Rename evaluation

**Outcome**: Rename decision is made only after broader capability exists.

**Tasks**:

* Compare shipped capability set against package name.
* If rename qualifies, create a release migration plan covering GitHub repo, package name, README, changelog, and compatibility notice.
* Do not rename in same change as unrelated features.

**Verification**:

* Package install path and old-user migration story are clear before metadata changes.

## Risks and Mitigations

| Risk                                                        | Likelihood | Impact | Mitigation                                                                                                           |
| ----------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `/morph-probe` becomes flaky due network/API state          | Med        | Med    | Classify external failures separately from implementation failures; keep checks small; allow skipped future checks.  |
| Helper extraction creates churn before value                | Med        | Low    | Keep helpers in `extensions/index.ts` until multiple features need split; extract only at reviewable boundary.       |
| Progressive disclosure activation gets stateful and brittle | Med        | Med    | Start with minimal search family; derive active tools from family state; restore/reset on documented session events. |
| SDK high-level WarpGrep output lacks enough Pi control      | Med        | Med    | Start high-level for speed; switch to direct protocol only if rendering/cancellation/bounds require it.              |
| Compact hook event shape differs from docs                  | Low        | Med    | Inspect current Pi type definitions before implementation; add probe/manual verification before claiming done.       |
| Automatic tool result compaction hides needed evidence      | Med        | High   | Keep default off/conservative; skip mutation outputs; always fallback to original on error.                          |
| Roadmap cleanup disrupts useful historical context          | Low        | Low    | Preserve useful history through specdocs links and git history; do not delete docs until PRD/plan cover them.        |

## Open Questions

* Should Morph search activation be model-triggered (`morph_search_enable`), operator-triggered (`/morph search enable`), or both?
* Should code be split into multiple extension modules before search/compact land, or after `/morph-probe` and model tier are complete?
* Should `/morph-probe` run a real Compact API call by default, or only when passed a subcommand such as `/morph-probe full`?
* What exact config names should be used for Compact enable/threshold/ratio once implementation starts?
* Should roadmap cleanup happen immediately after specdocs land, or after `/morph-probe` proves the new workflow?

## ADR Index

Decisions made during this plan:

| ADR                                                                         | Title                                        | Status   |
| --------------------------------------------------------------------------- | -------------------------------------------- | -------- |
| [ADR-0001](../adr/ADR-0001-pi-owned-file-mutation-for-morph-apply.md)       | Pi-owned file mutation for Morph Apply       | Proposed |
| [ADR-0002](../adr/ADR-0002-progressive-disclosure-for-morph-tool-family.md) | Progressive disclosure for Morph tool family | Proposed |
| [ADR-0003](../adr/ADR-0003-pi-auth-storage-for-morph-secrets.md)            | Pi auth storage for Morph secrets            | Proposed |

## Verification Plan

Before merging implementation phases:

1. Run `pnpm run typecheck`.
2. Run `pnpm run lint`.
3. Run `pnpm run test`.
4. Run `pnpm run build`.
5. Run `/morph-status` manually in Pi after command/config changes.
6. Run `/morph-probe` manually with missing and valid credentials after probe lands.
7. For each new model-facing tool, inspect or probe active tool visibility before release.
8. Run `specdocs_validate` after specdocs changes.
