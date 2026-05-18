---
title: "WarpGrep SDK Flexibility"
prd: "PRD-002-warpgrep-sdk-flexibility"
date: 2026-05-17
author: "Victor Software House"
status: Draft
---

# Plan: WarpGrep SDK Flexibility

## Source

* **PRD**: [docs/prd/PRD-002-warpgrep-sdk-flexibility.md](../prd/PRD-002-warpgrep-sdk-flexibility.md)
* **Date**: 2026-05-17
* **Author**: Victor Software House

## Architecture Overview

WarpGrep flexibility should be implemented in two layers. The first layer is the patched Morph SDK: expose capabilities that the direct API already supports or that the SDK already records internally, and fix public SDK options that currently do not work. The second layer is the Pi integration: keep the model-facing `codebase_search` schema intentionally small, pass search-relevant controls through, and keep engine tuning controls behind runtime configuration and tests.

The implementation must not replace the SDK with a parallel raw API loop unless live testing proves the SDK cannot support required behavior. The current SDK already owns the multi-turn loop, same-turn `Promise.all` tool execution, local ripgrep provider, streaming steps, finish resolution, and context budgeting. Patches should preserve that structure while making hidden controls observable and configurable.

The word `provider` in this work means WarpGrep's local or remote filesystem/search executor: a provider implements grep/read/list/glob. It is not an LLM provider. Pi continues to use Morph as the WarpGrep model/API backend. The implementation should not add remote sandbox provider abstractions in this slice; it should only keep the local provider wrapper where needed for timing, disabled redaction code, and node\_modules behavior.

## Components

### SDK Timing Result Patch

**Purpose**: Return internal WarpGrep timing data through the public SDK result.

**Key Details**:

* Patch `processAgentResult()` to preserve `result.timings` on both success and failure.
* Add/export a stable timing type if required by TypeScript declarations.
* Update `test/codebase-search-timing.ts` so `sdkTimings` is expected to be non-null after the patch.
* Keep external provider timings in the harness because they measure Pi wrapper overhead and ripgrep/read timings separately.

**ADR Reference**: None — straightforward observability patch.

### SDK Config Patch: Model and Generation Params

**Purpose**: Bring direct API flexibility to SDK config without exposing it to the Pi model.

**Key Details**:

* Add `model?: string` to SDK config and pass it to `runWarpGrepStreaming()`.
* Preserve default model `morph-warp-grep-v2.1`.
* Add `temperature?: number` and `maxTokens?: number` or equivalent config names.
* Preserve defaults `temperature: 0` and `max_tokens: 2048`.
* Check official docs/live API for WarpGrep model availability before documenting any `auto` behavior; do not assume Fast Apply `auto` applies to WarpGrep.
* Do not add `model`, `temperature`, or `maxTokens` to `codebase_search` parameters.

**ADR Reference**: Candidate only if a runtime config policy is needed later.

### SDK Includes / Excludes Patch

**Purpose**: Make public include/exclude controls behave predictably.

**Key Details**:

* `excludes` already works through `LocalRipgrepProvider` when SDK constructs the provider; preserve documented replacement semantics.
* `includes` currently appears dead in installed runtime; implement it in local grep/glob behavior.
* For ripgrep, apply include globs before/alongside exclude globs using `-g` patterns.
* Be explicit in README that include/exclude values are glob patterns passed to the underlying ripgrep-backed local search.
* Add fixture tests where the same term appears in included and excluded paths.

**ADR Reference**: None — fixing a public SDK option.

### Search Type and Node Modules Behavior

**Purpose**: Make `searchType: 'node_modules'` reliable for Pi's wrapped local provider.

**Key Details**:

* Current SDK default provider path can use `allowNames: ['node_modules']` when `search_type === 'node_modules'`.
* Pi's custom provider wrapper currently bypasses that path by constructing `new LocalRipgrepProvider(repoRoot)` itself.
* Do not implement remote/sandbox providers.
* Patch or wrap local provider construction so Pi can pass `excludes`, `includes`, and `allowNames` while still collecting timings or applying local policy.
* Compare behavior from:
  * fixture parent root,
  * `packageA` root,
  * `packageA/node_modules` root.
* Compare `searchType: 'default'` and `searchType: 'node_modules'` for each root.
* If direct `node_modules` root still fails under `default` because hidden-directory/dependency excludes apply to descendants, document the behavior and decide whether auto-detection should switch to node\_modules mode when the resolved root path itself contains `/node_modules`.

**ADR Reference**: Candidate — local provider wrapping versus SDK-owned provider factory may shape future diagnostics/redaction/timing behavior.

### SDK Limits Patch

**Purpose**: Expose internal search limits to advanced callers and tests.

**Key Details**:

* Add typed config for limits currently hardcoded in `AGENT_CONFIG`:
  * `maxTurns`,
  * `maxContextChars`,
  * `maxOutputLines`,
  * `maxListResults`,
  * `maxReadLines`,
  * `maxListDepth`,
  * `listTimeoutMs`.
* Keep existing defaults.
* Ensure turn-counter text and mandatory finish text use configured `maxTurns`.
* Add at least one test proving a non-default limit is honored.
* Do not expose limits in the Pi tool schema.

**ADR Reference**: None initially; can be an ADR if a public SDK config design needs formal stabilization.

### Raw Protocol Verification

**Purpose**: Resolve official docs versus installed SDK behavior before changing request shape.

**Key Details**:

* Official docs say WarpGrep tools are built into the model and callers do not need to pass a `tools` array.
* Installed SDK currently sends `tools: TOOL_SPECS`.
* Build a live comparison script/test that sends the same `<repo_structure>` and `<search_string>` request:
  * once without `tools`,
  * once with SDK-equivalent tool specs.
* Compare whether both produce usable `tool_calls`, tool names, and similar finish behavior.
* Only patch request shape if no-tools mode is verified and provides a reason to change.

**ADR Reference**: Candidate only if changing SDK request shape.

### Pi Tool Schema and Runtime Wiring

**Purpose**: Expose only search-relevant controls to the model.

**Key Details**:

* Change `CodebaseSearchParams` to include:
  * `searchTerm: string`,
  * `repoRoot?: string`,
  * `includes?: string[]`,
  * `excludes?: string[]`,
  * `searchType?: 'default' | 'node_modules'`.
* Keep `searchType` default as `default`.
* Keep descriptions short and task-focused.
* Do not expose model, generation params, provider, remoteCommands, timings, or limits.
* Pass args through to SDK/runtime config.
* Add tests that list schema keys and reject accidental schema growth.

**ADR Reference**: [ADR-0002](../adr/ADR-0002-straightforward-morph-tool-declarations.md) supports concise direct tool declarations.

### Documentation and Roadmap Update

**Purpose**: Keep repo artifacts aligned after implementation.

**Key Details**:

* README should document only user-visible args and environment/runtime knobs actually implemented.
* ROADMAP should link PRD-002 and this plan, and summarize implemented/deferred patch status.
* PRD/plan already document all seven patch candidates, including those not implemented immediately.
* If any patch is deliberately deferred after live testing, document why in the plan/roadmap rather than leaving it implicit.

**ADR Reference**: None.

## Implementation Order

| Phase | Component                                      | Dependencies   | Estimated Scope         |
| ----- | ---------------------------------------------- | -------------- | ----------------------- |
| 1     | Specdocs and validation                        | None           | S                       |
| 2     | Live model/protocol reconnaissance             | Phase 1        | M                       |
| 3     | SDK timing patch                               | Phase 1        | S                       |
| 4     | SDK model/generation config patch              | Phase 2        | M                       |
| 5     | SDK includes/excludes patch                    | Phase 1        | M                       |
| 6     | Search type/node\_modules local provider patch | Phase 5        | M                       |
| 7     | SDK limits patch                               | Phase 3        | M                       |
| 8     | Pi `codebase_search` schema/runtime wiring     | Phases 3, 5, 6 | M                       |
| 9     | Raw protocol request-shape decision            | Phase 2        | S/M depending on result |
| 10    | Live fixture/public-repo verification          | Phases 3-9     | M                       |
| 11    | README/ROADMAP update and final gate           | Phase 10       | S                       |

## Phase Details

### Phase 1: Specdocs and validation

1. Create [PRD-002](../prd/PRD-002-warpgrep-sdk-flexibility.md).
2. Create this plan.
3. Run `specdocs_format` and `specdocs_validate`.
4. Do not edit runtime code until validation passes or issues are understood.

### Phase 2: Live model/protocol reconnaissance

1. Re-check official docs from `https://docs.morphllm.com/llms-full.txt` for current WarpGrep model list.
2. Probe whether `model: 'auto'` is accepted for WarpGrep; record result without exposing it to the model.
3. Run raw protocol no-tools versus tools-array comparison.
4. Decide whether request-shape patch 7 is implementation or documentation-only.

### Phase 3: SDK timing patch

1. Patch SDK result types and runtime to include timings.
2. Update timing harness to fail loudly or mark missing timings when using patched SDK.
3. Run live `nodejs/node` search and confirm `sdkTimings` is non-null.

### Phase 4: SDK model/generation config patch

1. Add typed config fields for `model`, `temperature`, and `maxTokens`.
2. Pass fields to `callModel()` and the OpenAI-compatible request body.
3. Add an intercept/unit test proving request body values are used.
4. Keep Pi tool schema unchanged for these fields.

### Phase 5: SDK includes/excludes patch

1. Implement `includes` in local provider grep/glob.
2. Confirm `excludes` behavior remains documented replacement semantics.
3. Build deterministic fixtures where the same term appears in included/excluded locations.
4. Add tests for include/exclude wiring.

### Phase 6: Search type and node\_modules behavior

1. Patch local provider construction or options so a wrapped provider can use includes, excludes, and `allowNames`.
2. Add `searchType` to Pi schema as a string enum defaulting to `default`.
3. Build node\_modules fixture matrix:
   * parent root + default,
   * parent root + node\_modules,
   * package root + default,
   * package root + node\_modules,
   * node\_modules root + default,
   * node\_modules root + node\_modules.
4. If searching from a parent root needs `includes` to focus `packageA/node_modules`, document that expectation.
5. If root path contains `/node_modules`, consider auto-detecting `node_modules` mode unless the user explicitly set `searchType`.

### Phase 7: SDK limits patch

1. Add typed `limits` config.
2. Replace hardcoded `AGENT_CONFIG` reads with effective config values where safe.
3. Ensure turn budget prompts and mandatory finish messages respect configured `maxTurns`.
4. Add one focused limit test.

### Phase 8: Pi schema and runtime wiring

1. Add `includes`, `excludes`, and `searchType` to `CodebaseSearchParams` only.
2. Pass search args into SDK/provider construction.
3. Keep `provider`, `model`, `temperature`, `maxTokens`, and `limits` out of the model-facing schema.
4. Add schema tests to guard against accidental bloat.

### Phase 9: Raw protocol decision

1. If no-tools mode fails or offers no benefit, keep SDK request shape and document the docs/runtime mismatch.
2. If no-tools mode works and is preferable, patch SDK request shape behind a compatibility option or default only after tests.
3. Do not make speculative changes.

### Phase 10: Live verification

1. Run timing harness against public `nodejs/node` clone.
2. Run live/local fixture include/exclude tests.
3. Run live/local fixture node\_modules matrix.
4. Run raw protocol comparison.
5. Run full gate:
   * `pnpm run typecheck`,
   * `pnpm run lint`,
   * `pnpm run test`,
   * `pnpm run build`.

### Phase 11: Docs and commit

1. Update README with final user-visible args and runtime controls.
2. Update ROADMAP with PRD-002 and plan links.
3. If some patches are deferred, state exact reason and evidence.
4. Commit with Conventional Commits and push.

## Risks and Mitigations

| Risk                                                      | Likelihood | Impact | Mitigation                                                                                  |
| --------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------- |
| SDK patch is too broad to review                          | Medium     | High   | Commit in logical slices; keep patch areas separated in tests and docs.                     |
| Live API behavior differs from docs                       | High       | Medium | Run raw protocol checks before request-shape changes; document mismatch.                    |
| Node\_modules matrix is flaky due WarpGrep model choice   | Medium     | Medium | Use distinctive fixture identifiers and explicit search terms; inspect streamed tool calls. |
| Includes implementation breaks default excludes           | Medium     | High   | Test include-only, exclude-only, and include+exclude cases.                                 |
| Tool schema bloats over time                              | Medium     | Medium | Add schema-key test allowing only five fields.                                              |
| Timing patch changes public type shape unexpectedly       | Low        | Medium | Make timings optional and backward-compatible.                                              |
| Redaction code conflicts with node\_modules/include tests | Medium     | Low    | Disable redaction via existing env for synthetic fixtures if needed; do not delete code.    |

## Open Questions

* Does WarpGrep accept `model: 'auto'`, or is `morph-warp-grep-v2.1` the only valid current model?
* Does no-tools raw protocol work better, worse, or identically to SDK `tools: TOOL_SPECS`?
* Should direct `repoRoot` inside `node_modules` auto-select node\_modules mode?
* Should Pi runtime wire operator env vars for model/generation/limits in this implementation, or should SDK patch support land first with no Pi runtime surface?
* Should redaction default change in the same implementation commit or separate follow-up?

## ADR Index

Decisions made or candidates surfaced during this plan:

| ADR                                                                    | Title                                                                                                  | Status                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [ADR-0002](../adr/ADR-0002-straightforward-morph-tool-declarations.md) | Straightforward Morph tool declarations                                                                | Existing Proposed                                                        |
| Candidate                                                              | Keep SDK patching as the WarpGrep flexibility boundary instead of raw API reimplementation             | Candidate if raw protocol work creates lasting fork/SDK boundary         |
| Candidate                                                              | Keep local provider wrapper for filesystem/search instrumentation while avoiding remote provider scope | Candidate if wrapper/provider factory design becomes reusable public API |
| Candidate                                                              | Change or preserve SDK request shape (`tools` array vs built-in tools only)                            | Candidate only if live evidence supports a behavior change               |
