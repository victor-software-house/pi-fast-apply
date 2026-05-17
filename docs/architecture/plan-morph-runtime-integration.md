---
title: "Morph Runtime Integration"
prd: "PRD-001-morph-runtime-integration"
date: 2026-05-15
author: "Victor Software House"
status: Draft
provenance:
  pi_session:
    id: "019e2e39-246e-77dc-8b1e-90b3f17e48b1"
    name: "Morph Runtime Integration Specdocs"
    file: "/Users/victor/.pi/agent/sessions/--Users-victor-workspace-victor-pi-ecosystem-pi-fast-apply--/2026-05-16T00-39-17-359Z_019e2e39-246e-77dc-8b1e-90b3f17e48b1.jsonl"
    cwd: "/Users/victor/workspace/victor/pi-ecosystem/pi-fast-apply"
    started_at_brt: "2026-05-15T21:41:51-03:00"
  created_at_brt: "2026-05-15"
---

# Plan: Morph Runtime Integration

## Source

* **PRD**: [docs/prd/PRD-001-morph-runtime-integration.md](../prd/PRD-001-morph-runtime-integration.md)
* **Date**: 2026-05-15
* **Author**: Victor Software House

## Creation Provenance

| Field                 | Value                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Created in Pi session | `019e2e39-246e-77dc-8b1e-90b3f17e48b1`                                                                                                                              |
| Session file          | `/Users/victor/.pi/agent/sessions/--Users-victor-workspace-victor-pi-ecosystem-pi-fast-apply--/2026-05-16T00-39-17-359Z_019e2e39-246e-77dc-8b1e-90b3f17e48b1.jsonl` |
| Session name          | Morph Runtime Integration Specdocs                                                                                                                                  |
| Created               | 2026-05-15 BRT                                                                                                                                                      |

## Architecture Overview

`pi-fast-apply` should grow from a single Fast Apply tool into a small Morph runtime integration while preserving Pi as the owning runtime. Pi remains responsible for local filesystem access, mutation queueing, auth resolution, command UX, model-visible tool activation, and operator rendering. Morph remains the semantic service used for merge, search, compact, and optional routing decisions.

The first implementation workstream should not add search or compaction. It should make the current runtime observable and explicit: add `/morph-probe`, factor shared Morph config/auth helpers, and pass explicit Fast Apply model-tier config into `applyEdit()`. That creates a safe verification surface before additional Morph API calls enter the package.

Broader capabilities should be added with straightforward model-facing names and readable labels. `fast_apply` remains stable with label `Fast Apply`; local WarpGrep should use Morph's recommended `codebase_search` name with label `Codebase Search`; public GitHub search should ship later as a separate direct tool such as `github_code_search` with label `GitHub Code Search`. Activator stubs are explicitly avoided because they have not been reliable in practice. Compact has two paths: explicit session compaction through `session_before_compact` first, then experimental conservative `tool_result` compaction after real behavior is proven.

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
* Keep `MORPH_API_URL` and `MORPH_EDIT_TIMEOUT_MS`; add explicit Fast Apply large-mode config such as `MORPH_APPLY_LARGE=true|false`.
* Avoid global config auto-creation and avoid secret persistence outside Pi auth/env.
* Consider extracting helpers from `extensions/index.ts` only if the first runtime slice becomes hard to review.

**ADR Reference**: [ADR-0003](../adr/ADR-0003-pi-auth-storage-for-morph-secrets.md): Pi auth storage for Morph secrets.

### Fast Apply Model Control

**Purpose**: Preserve existing Fast Apply behavior while making model tier explicit and visible.

**Key Details**:

* Parse `MORPH_APPLY_LARGE=true|false`; default false.
* Add optional per-call `fast_apply.large` boolean; per-call value overrides the configured default for that edit.
* Always use SDK `applyEdit()` and pass explicit `large: false|true`.
* `/morph-status`, `/morph-probe`, and `fast_apply` result `details` should include effective large value, source, and resolved model id.
* Invalid config should not silently choose a surprising model; report default/fallback clearly.
* Model-facing guidance should stay short: default `large: false` for most edits; use `large: true` for complex/risky edits. Morph docs put fast around 96% accuracy and large around 98% accuracy.
* `@morphllm/morphsdk@0.2.171` is current latest. It does not expose `auto`; raw Chat Completions and structured Code Apply were live-tested with `auto`, but the first package slice should not add that complexity while SDK `large` flag covers the user-facing choice.

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

### Morph Search Tools

**Purpose**: Add local and public GitHub semantic code search through WarpGrep using direct, intuitive tool declarations.

**Key Details**:

* Prefer high-level SDK `morph.warpGrep.execute({ searchTerm, repoRoot, streamSteps: true })` for first local implementation.
* Always stream when SDK supports it; route yielded WarpGrep steps through Pi `onUpdate` for operator-visible progress.
* Local search model-facing name should be `codebase_search`; operator label should be `Codebase Search`.
* Drop to direct protocol only if high-level SDK prevents required rendering, cancellation, bounded output, or direct API features.
* GitHub search should be a separate later tool, likely `github_code_search` with label `GitHub Code Search`, using `morph.warpGrep.searchGitHub({ searchTerm, github, branch, streamSteps: true })` and public repos only.
* Tool output should return bounded file:line contexts. Intermediate search attempts should remain inside WarpGrep's isolated context.
* Search tools should distinguish semantic/broad search from exact keyword lookup; exact lookup stays native grep/find.
* Remote/sandbox search via `remoteCommands` or custom providers is an advanced later phase after local and public GitHub behavior is validated.

**ADR Reference**: [ADR-0002](../adr/ADR-0002-straightforward-morph-tool-declarations.md): Straightforward Morph tool declarations.

### Tool Declaration Surface

**Purpose**: Keep Morph tools obvious to the model and readable to the operator without unreliable activator stubs.

**Key Details**:

* Keep `fast_apply` stable with label `Fast Apply`.
* Add direct search tools with names that match model expectations and current tool patterns.
* Keep schemas minimal and natural-language oriented; `codebase_search` should accept natural-language `searchTerm` or a carefully chosen equivalent, not regex flags.
* Use concise descriptions and prompt guidance; avoid mini-manuals in provider-visible tool metadata.
* Validate provider-visible prompt/tool impact before shipping expanded tool metadata.

**ADR Reference**: [ADR-0002](../adr/ADR-0002-straightforward-morph-tool-declarations.md): Straightforward Morph tool declarations.

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

| Phase | Component                             | Dependencies         | Estimated Scope |
| ----- | ------------------------------------- | -------------------- | --------------- |
| 1     | Specdocs foundation                   | None                 | S               |
| 2     | Runtime core helper cleanup           | Phase 1              | S               |
| 3     | Morph probe command                   | Phase 2              | M               |
| 4     | Fast Apply explicit model control     | Phase 2              | S               |
| 5     | Tool declaration surface              | Phase 1, Phase 2     | S               |
| 6     | Local WarpGrep `codebase_search`      | Phase 5              | M               |
| 7     | Public GitHub code search             | Phase 6              | M               |
| 8     | Remote/sandbox search experiment      | Phase 6              | M               |
| 9     | Explicit Compact hook                 | Phase 2, Phase 3     | M               |
| 10    | Search excerpt compaction experiments | Phase 6, Phase 9     | M/L             |
| 11    | Optional tool\_result compaction      | Phase 9, Phase 10    | M/L             |
| 12    | Roadmap/specdocs cleanup              | Phase 1, ADRs        | S               |
| 13    | Rename evaluation                     | Phases 6-11 complete | M               |

### Phase 1: Specdocs foundation

**Outcome**: PRD, plan, and ADRs exist and validate.

**Tasks**:

* Create `docs/prd/PRD-001-morph-runtime-integration.md`.
* Create `docs/architecture/plan-morph-runtime-integration.md`.
* Create ADRs for file mutation ownership, straightforward tool declarations, and secret storage.
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

* Add `getMorphApplyLarge()` parsing, values: `true` and `false`, default false.
* Add optional `fast_apply.large` boolean parsing; per-call value wins over env/default.
* Pass `large: effectiveLarge` to SDK `applyEdit()` explicitly.
* Show large value, source, and resolved model id in `/morph-status` and `/morph-probe`.
* Put large value, source, and resolved model id in `fast_apply` result `details` for renderer/debugging.
* Keep raw `auto` evidence in docs/probe diagnostics only; do not expose model enum in first slice.

**Verification**:

* Helper tests for unset, `true`, `false`, invalid values, and per-call override precedence.
* Config tests confirm SDK receives explicit `large: false|true`.
* Manual dry-run confirms no behavior regression for default false and per-call true.

### Phase 5: Tool declaration surface

**Outcome**: Morph tools have stable model-facing names, readable labels, concise schemas, and no activator stubs.

**Tasks**:

* Keep existing `fast_apply` name and `Fast Apply` label.
* Reserve `codebase_search` for local WarpGrep search with label `Codebase Search`.
* Reserve a separate later GitHub search name such as `github_code_search` with label `GitHub Code Search`.
* Keep parameter schemas minimal and natural-language oriented; `codebase_search` should accept a natural-language query. Prefer `searchTerm` to match current Pi/SDK camelCase patterns, but consider accepting `search_term` via `prepareArguments` compatibility if live tests show Morph-trained prompting favors it.
* Probe provider-visible prompt/tool state before release if possible.

**Verification**:

* Tool declarations are direct and self-explanatory.
* No model-facing activator stub is required to use implemented Morph tools.
* Exact-string search guidance points back to native grep/find.

### Phase 6: Local WarpGrep `codebase_search`

**Outcome**: Model can request broad semantic local search through Morph.

**Tasks**:

* Add direct `codebase_search` model-facing tool with label `Codebase Search`.
* Use high-level SDK first: `morph.warpGrep.execute({ searchTerm, repoRoot, streamSteps: true })`.
* Test whether model calls prefer `searchTerm` or `search_term`; support both if needed without bloating provider schema.
* Always stream when possible and surface WarpGrep steps through `onUpdate`.
* Bound output size and format as file:line contexts.
* Document exact-grep fallback to native tools.
* Add `/morph-probe` local search check after implementation.

**Verification**:

* Search this repo for `resolveMorphApiKey`; result references `extensions/index.ts`.
* Search broad term like `operator auth status`; output bounded and useful.
* Exact string guidance remains in tool metadata/docs.

### Phase 7: Public GitHub code search

**Outcome**: Model can search public GitHub repos without cloning.

**Tasks**:

* Add separate GitHub search tool, likely `github_code_search`, with label `GitHub Code Search`.
* Use `morph.warpGrep.searchGitHub({ searchTerm, github, branch, streamSteps: true })`.
* Accept `owner/repo` and full GitHub URL; normalize to `owner/repo`.
* Optional branch parameter.
* Validate malformed identifiers locally; treat 404/private as public-only failure.
* Add `/morph-probe` GitHub search check only if safe, cheap, and non-flaky; otherwise keep manual verification.

**Verification**:

* Search known public repo with branch omitted.
* Malformed repo input fails locally with clear message.
* Private/missing repo failure does not ask for extra secrets.

### Phase 8: Remote/sandbox search experiment

**Outcome**: Decide whether Pi needs WarpGrep `remoteCommands` or custom provider support.

**Tasks**:

* Test SDK `remoteCommands` with a controlled command provider before adding public schema.
* Confirm return formats: ripgrep stdout for `grep`, raw file text for `read`, one path per line for `listDir` / `glob` where applicable.
* Decide whether remote search belongs in this package or should be separate from local/GitHub search.
* Keep remote/sandbox config out of the initial local search tool unless experiments prove it is needed.

**Verification**:

* Remote experiment records result quality, latency, failure modes, and security concerns.
* No remote execution knobs ship without explicit docs and tests.

### Phase 9: Explicit Compact hook

**Outcome**: Manual/session compaction can use Morph Compact safely.

**Tasks**:

* Register `pi.on('session_before_compact', ...)`.
* Build compact input from Pi event shape after inspecting current types.
* Pass `query`, `compressionRatio`, and `preserveRecent >= 3` where supported.
* Fallback to default compaction if disabled, missing key, or API failure.
* Add status/probe fields for compact config.

**Verification**:

* Trigger compaction in a test/manual Pi session with key and inspect reduction stats.
* Remove key and verify default compaction path still works.

### Phase 10: Search excerpt compaction experiments

**Outcome**: Determine whether full file excerpts returned from search should be compacted directly, formatted first, or left untouched.

**Tasks**:

* Run experiments compacting raw file excerpts, pretty-formatted JSON, and Markdown/code-fenced excerpts.
* Test JSON pretty-formatting before compaction to avoid giant single-line payload failures.
* Compare result quality for search excerpts using explicit `query` values.
* Decide whether excerpt compaction belongs inside search tools, Compact hooks, or a later optional mode.

**Verification**:

* Experiment notes include before/after excerpts, token/line reduction, and qualitative usefulness.
* No automatic excerpt compaction ships until quality is validated.

### Phase 11: Optional tool\_result compaction

**Outcome**: Large model-facing tool outputs can be compacted before reaching the model when explicitly enabled.

**Tasks**:

* Add opt-in env/config flag and threshold.
* Register `pi.on('tool_result', ...)` only after explicit compaction and excerpt experiments are validated.
* Skip mutation tools and small/structured outputs.
* Preserve or skip active edit-target reads conservatively.
* Put reduction stats in `details`; show concise operator diagnostic.

**Verification**:

* Large read/grep output is compacted when enabled.
* `fast_apply`, `edit`, `write`, and errors are skipped.
* Failures fall back to original content.

### Phase 12: Roadmap/specdocs cleanup

**Outcome**: Specdocs are source of truth.

**Tasks**:

* Replace `ROADMAP.md` content with a short specdocs index or remove if README links suffice.
* Link README development section to PRD/plan/ADR docs.
* Ensure no ad hoc roadmap phase codes remain as source of truth.

**Verification**:

* `rg` for old roadmap code pattern returns none outside historical git.
* Docs links resolve locally.

### Phase 13: Rename evaluation

**Outcome**: Rename decision is made only after broader capability exists.

**Tasks**:

* Compare shipped capability set against package name.
* If rename qualifies, create a release migration plan covering GitHub repo, package name, README, changelog, and compatibility notice.
* Do not rename in same change as unrelated features.

**Verification**:

* Package install path and old-user migration story are clear before metadata changes.

## Risks and Mitigations

| Risk                                                   | Likelihood | Impact | Mitigation                                                                                                          |
| ------------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `/morph-probe` becomes flaky due network/API state     | Med        | Med    | Classify external failures separately from implementation failures; keep checks small; allow skipped future checks. |
| Helper extraction creates churn before value           | Med        | Low    | Keep helpers in `extensions/index.ts` until multiple features need split; extract only at reviewable boundary.      |
| Direct search tools add baseline prompt/schema cost    | Med        | Med    | Keep schemas concise, avoid long prompt guidelines, and inspect provider-visible tool payload before release.       |
| SDK high-level WarpGrep output lacks enough Pi control | Med        | Med    | Start high-level for speed; switch to direct protocol only if rendering/cancellation/bounds require it.             |
| Compact hook event shape differs from docs             | Low        | Med    | Inspect current Pi type definitions before implementation; add probe/manual verification before claiming done.      |
| Automatic tool result compaction hides needed evidence | Med        | High   | Keep default off/conservative; skip mutation outputs; always fallback to original on error.                         |
| Roadmap cleanup disrupts useful historical context     | Low        | Low    | Preserve useful history through specdocs links and git history; do not delete docs until PRD/plan cover them.       |

## Open Questions

* Resolved: do not use Morph search activators; use direct `codebase_search` and later `github_code_search` declarations.
* Should code be split into multiple extension modules before search/compact land, or after `/morph-probe` and model tier are complete?
* Should `/morph-probe` run a real Compact API call by default, or only when passed a subcommand such as `/morph-probe full`?
* What exact config names should be used for Compact enable/threshold/ratio once implementation starts?
* Should roadmap cleanup happen immediately after specdocs land, or after `/morph-probe` proves the new workflow?

## ADR Index

Decisions made during this plan:

| ADR                                                                    | Title                                   | Status   |
| ---------------------------------------------------------------------- | --------------------------------------- | -------- |
| [ADR-0001](../adr/ADR-0001-pi-owned-file-mutation-for-morph-apply.md)  | Pi-owned file mutation for Morph Apply  | Proposed |
| [ADR-0002](../adr/ADR-0002-straightforward-morph-tool-declarations.md) | Straightforward Morph tool declarations | Proposed |
| [ADR-0003](../adr/ADR-0003-pi-auth-storage-for-morph-secrets.md)       | Pi auth storage for Morph secrets       | Proposed |

## Verification Plan

Before merging implementation phases:

1. Run `pnpm run typecheck`.
2. Run `pnpm run lint`.
3. Run `pnpm run test`.
4. Run `pnpm run build`.
5. Run `/morph-status` manually in Pi after command/config changes.
6. Run `/morph-probe` manually with missing and valid credentials after probe lands.
7. For each new model-facing tool, inspect or probe provider-visible tool metadata before release.
8. Run `specdocs_validate` after specdocs changes.
