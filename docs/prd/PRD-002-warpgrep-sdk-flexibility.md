---
title: "WarpGrep SDK Flexibility"
prd: PRD-002
status: Draft
owner: "Victor Software House"
issue: "N/A"
date: 2026-05-17
version: "1.0"
---

# PRD: WarpGrep SDK Flexibility

---

## 1. Problem & Context

`pi-fast-apply` now exposes local Morph WarpGrep through the Pi model-facing `codebase_search` tool. The current implementation works and uses Morph's official TypeScript SDK, but the integration is intentionally narrow: Pi passes `searchTerm`, `repoRoot`, a local redacting provider wrapper, and `streamSteps: true`. That kept the first search slice safe, but it also hides WarpGrep controls that matter for real repository work.

Recent live testing and SDK inspection found seven concrete patch areas:

1. **Expose timings** — the installed SDK records `initial_state_ms`, per-turn `morph_api_ms`, `local_tools_ms`, `finish_resolution_ms`, and `total_ms`, but `processAgentResult()` drops those timings from the public `WarpGrepResult`.
2. **Expose model** — the direct API uses `model: "morph-warp-grep-v2.1"` and the internal runner accepts `config.model`, but `WarpGrepClientConfig` does not expose `model`.
3. **Expose generation parameters** — the direct API exposes `temperature` and `max_tokens`; the SDK hardcodes `temperature: 0` and `max_tokens: 2048`.
4. **Implement `includes`** — public SDK types and docs expose `includes?: string[]`, but the installed runtime only passes the value around and does not apply it in local search.
5. **Fix custom provider interaction with `search_type` / node\_modules** — the SDK can construct a `LocalRipgrepProvider` with `allowNames: ['node_modules']` for `search_type: 'node_modules'`, but `pi-fast-apply` currently supplies its own wrapper provider, bypassing that default-provider path.
6. **Expose limits** — the SDK hardcodes turn count, output caps, context budget, read/list limits, and directory depth; these should be configurable at SDK level for tuning and live verification.
7. **Clarify raw protocol / built-in tools mode** — official docs say WarpGrep tools are built into the model and callers do not need to pass a `tools` array, while the installed SDK sends `TOOL_SPECS`; this mismatch needs live verification before any behavior change.

The goal is to bring these controls down to SDK level where they belong, then expose only a minimal Pi tool surface. The Pi model should see only useful search controls: `searchTerm`, optional `repoRoot`, optional `includes`, optional `excludes`, and optional `searchType` defaulting to `default`. Model selection, generation parameters, internal provider selection, and SDK limits must not be exposed as model-facing arguments.

Terminology note: in WarpGrep docs and SDK code, **provider** means a local filesystem/search provider (`LocalRipgrepProvider`, custom `WarpGrepProvider`, or `remoteCommands`) that executes grep/read/list/glob operations. It does **not** mean an LLM provider such as Anthropic or OpenAI. `pi-fast-apply` still uses Morph as the LLM/search model provider.

---

## 2. Goals & Success Metrics

| Goal                                        | Metric                                                                                                       | Target                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **SDK flexibility without Pi schema bloat** | WarpGrep SDK exposes timing/model/generation/include/limit knobs, while Pi exposes only search-relevant args | `codebase_search` schema contains only `searchTerm`, `repoRoot`, `includes`, `excludes`, and `searchType` |
| **Observable live timing**                  | Live search result includes SDK timing data without external monkey-patching                                 | `pnpm run measure:codebase-search` reports non-null `sdkTimings` after SDK patch                          |
| **Correct include/exclude behavior**        | Local searches respect include and exclude globs                                                             | Live fixture proves `includes` narrows results and `excludes` removes selected paths                      |
| **Correct node\_modules behavior**          | `searchType: node_modules` works from package root, parent root, and nested `packageA/node_modules` root     | Live fixture matrix passes all selected root/searchType combinations                                      |
| **Official API alignment**                  | Raw protocol behavior is tested with and without SDK-passed tool specs                                       | Documentation records whether no-tools mode works and whether SDK should keep or change default behavior  |
| **Minimal operator/model risk**             | No new model-facing knobs for model name, temperature, max tokens, or limits                                 | Tests or schema snapshots prove those fields are absent from `codebase_search` parameters                 |

**Guardrails (must not regress):**

* `codebase_search` remains a local workspace-bounded Morph tool.
* Exact search remains native `grep`/`find`; WarpGrep remains for semantic discovery.
* Model-facing descriptions and schema stay concise.
* API keys are never printed in timing or live test output.
* Redaction code may be disabled by default if requested, but should not be deleted until explicitly removed.
* Existing Fast Apply `auto` SDK patch and `fast_apply` behavior must remain unchanged.
* `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, and `pnpm run build` must pass before commit.

---

## 3. Users & Use Cases

### Primary: Pi model using local semantic search

> As the model inside Pi, I want to search a codebase semantically with only a small set of search-relevant controls so that I can find implementation context without learning internal WarpGrep tuning knobs.

**Preconditions:** The package extension is loaded; a Morph API key is available through Pi auth storage or `MORPH_API_KEY`.

### Primary: Pi operator debugging search behavior

> As a Pi operator, I want live timing and node\_modules/include/exclude verification so that I can understand whether search latency or misses come from Morph turns, local ripgrep, path filtering, or SDK defaults.

**Preconditions:** The operator can run repo scripts with `MORPH_API_KEY` from fnox or Pi auth and a public/local fixture repo.

### Secondary: SDK patch maintainer

> As maintainer, I want WarpGrep flexibility implemented in SDK patches rather than Pi-only workarounds so that other SDK paths and future agents benefit from the same controls.

**Preconditions:** The repo can carry pnpm patches for `@morphllm/morphsdk@0.2.171`, as already done for Fast Apply `auto`.

### Future: Advanced operator configuring non-model knobs

> As an operator, I want environment/config-level control of model, temperature, max tokens, and limits without exposing those knobs to the model-facing `codebase_search` tool.

**Preconditions:** SDK supports the knobs and Pi runtime config maps trusted env/config values into `WarpGrepClientConfig`.

---

## 4. Scope

### In scope

1. **SDK timing patch** — preserve internal WarpGrep timings in public results and timing harness output.
2. **SDK model patch** — expose `model` at SDK config level, defaulting to the existing WarpGrep model.
3. **SDK generation patch** — expose `temperature` and `maxTokens` at SDK config level, defaulting to existing values.
4. **SDK includes patch** — make `includes` effective in local ripgrep-backed searches.
5. **SDK search type / node\_modules patch** — make node\_modules search work when Pi uses a wrapped local provider, and verify parent/package/node\_modules root behavior.
6. **SDK limits patch** — expose turn/output/list/read/context limits at SDK config level; document and test at least one non-default limit.
7. **Raw protocol verification** — live-test official no-tools protocol versus current SDK `tools: TOOL_SPECS` behavior before deciding whether to patch request shape.
8. **Pi tool schema update** — keep args minimal: `searchTerm`, `repoRoot`, `includes`, `excludes`, `searchType`.
9. **Live fixture matrix** — compare `default` vs `node_modules` search types from parent root, package root, and direct `node_modules` root.
10. **Docs** — document implemented and deferred patch behavior in README/ROADMAP/specdocs after code lands.

### Out of scope / later

| What                                                          | Why                                                                                        | Tracked in                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| Exposing model/temperature/maxTokens/limits to the Pi model   | These are operator/runtime tuning knobs, not search task arguments                         | This PRD, runtime config follow-up |
| Remote sandbox search via `remoteCommands`                    | User explicitly asked not to implement provider plumbing now; local Morph path is priority | Future PRD if needed               |
| LLM-provider adapters such as Anthropic/OpenAI tool factories | Pi calls Morph WarpGrep directly; external agent adapter work is irrelevant here           | Deferred                           |
| Removing redaction code                                       | User asked not to delete it yet; only default behavior may change                          | Follow-up decision                 |
| Upstream PR to Morph SDK                                      | Current repo carries patches; upstreaming can happen after local behavior is verified      | Future issue/PR                    |
| Private GitHub search                                         | Needs separate auth and security review                                                    | Future PRD                         |

### Design for future (build with awareness)

* Keep SDK patch surfaces reusable and typed; avoid Pi-only monkey-patches that cannot be reused by `WarpGrepClient` callers.
* Keep runtime config and model-facing tool schemas separate.
* Treat `provider` as filesystem/search execution plumbing; avoid conflating it with LLM providers.
* Keep node\_modules behavior testable through deterministic fixtures, not assumptions about this repo's dependencies.

---

## 5. Functional Requirements

### FR-1: Expose WarpGrep timings from SDK results

The SDK patch must preserve internal timing data in public `WarpGrepResult` objects for both success and failure paths.

**Acceptance criteria:**

```gherkin
Given a live local WarpGrep search is run with streamSteps enabled
When the search completes
Then the final result includes sdkTimings.total_ms and per-turn morph_api_ms/local_tools_ms values
```

**Files:**

* `patches/@morphllm__morphsdk@0.2.171.patch` — expose timings in public result.
* `test/codebase-search-timing.ts` — report non-null `sdkTimings`.
* `test/codebase-search-live.test.ts` — assert timings exist in live gated tests where feasible.

### FR-2: Expose WarpGrep model at SDK config level only

The SDK patch must allow callers to pass a WarpGrep model string through config while preserving the default `morph-warp-grep-v2.1`. Pi must not expose this field to the model-facing `codebase_search` schema.

**Acceptance criteria:**

```gherkin
Given codebase_search is registered in Pi
When its model-facing parameter schema is inspected
Then there is no model parameter
And WarpGrepClientConfig accepts an optional model parameter for runtime configuration
```

**Files:**

* `patches/@morphllm__morphsdk@0.2.171.patch` — add `model?: string` pass-through.
* `extensions/runtime-config.ts` — map optional trusted runtime config if implemented.
* `extensions/codebase-search-tool.ts` — do not add model to tool args.
* `test/codebase-search-tool.test.ts` — assert schema excludes model.

### FR-3: Expose generation parameters at SDK config level only

The SDK patch must allow `temperature` and `maxTokens` configuration while preserving defaults `0` and `2048`. Pi must not expose these fields as model-facing args.

**Acceptance criteria:**

```gherkin
Given a caller constructs WarpGrepClient with maxTokens configured
When a live or intercepted WarpGrep call is made
Then the request body uses the configured max_tokens value
And codebase_search parameters still omit maxTokens and temperature
```

**Files:**

* `patches/@morphllm__morphsdk@0.2.171.patch` — add generation config and request pass-through.
* `test/codebase-search-tool.test.ts` — schema absence checks.
* `test/codebase-search-live.test.ts` or a local SDK request intercept test — verify request payload.

### FR-4: Make includes effective

`includes` must narrow local ripgrep-backed searches. This fixes a currently public-but-dead SDK option.

**Acceptance criteria:**

```gherkin
Given a fixture repo contains src/app.ts and docs/app.md with the same searchable term
When codebase_search runs with includes set to ["src/**/*.ts"]
Then returned contexts come from src/app.ts
And docs/app.md is not returned
```

**Files:**

* `patches/@morphllm__morphsdk@0.2.171.patch` — apply includes to local provider grep/glob behavior.
* `extensions/codebase-search-tool.ts` — accept optional `includes` array and pass it through.
* `test/codebase-search-tool.test.ts` — unit/harness behavior for includes.
* `test/codebase-search-live.test.ts` — gated live behavior where feasible.

### FR-5: Make excludes explicit and preserve default behavior

`excludes` must remain optional. If omitted, SDK defaults apply. If provided, behavior must match official docs: caller-provided excludes replace SDK defaults unless the SDK patch deliberately documents another mode.

**Acceptance criteria:**

```gherkin
Given a fixture repo contains src/app.ts and dist/app.ts with the same searchable term
When codebase_search runs with excludes set to ["dist"]
Then returned contexts do not include dist/app.ts
```

**Files:**

* `extensions/codebase-search-tool.ts` — accept optional `excludes` array and pass it through.
* `test/codebase-search-tool.test.ts` — assert excludes wiring.
* `README.md` — document replacement semantics if exposed.

### FR-6: Support searchType with node\_modules behavior

`searchType` must default to `default` and allow `node_modules`. Node\_modules mode must work even when Pi wraps the local provider for timing/redaction/diagnostics.

**Acceptance criteria:**

```gherkin
Given a fixture repo has packageA/src/app.ts and packageA/node_modules/pkg/index.js
When codebase_search runs from packageA with searchType node_modules
Then pkg/index.js can be found
And when it runs with searchType default
Then pkg/index.js is not selected
```

```gherkin
Given the same fixture repo is searched from the parent directory
When codebase_search runs with searchType node_modules and includes target packageA/node_modules paths
Then the node_modules result can still be found
```

**Files:**

* `patches/@morphllm__morphsdk@0.2.171.patch` — make searchType/allowNames usable with wrapped provider or expose a local provider factory.
* `extensions/codebase-search-tool.ts` — accept `searchType` enum and pass it through.
* `test/codebase-search-live.test.ts` — live fixture matrix for parent/package/node\_modules roots.
* `test/codebase-search-timing.ts` — allow optional searchType/includes/excludes through env or CLI if needed.

### FR-7: Expose SDK limits without model-facing schema bloat

The SDK patch must expose limits for advanced callers. Pi may wire trusted env/config later, but the model-facing tool must not expose limits.

**Acceptance criteria:**

```gherkin
Given WarpGrepClient is configured with a lower maxTurns value
When a search needs more turns than allowed
Then the SDK terminates according to the configured limit
And codebase_search parameters do not include maxTurns or output limits
```

**Files:**

* `patches/@morphllm__morphsdk@0.2.171.patch` — add typed `limits` config.
* `test/codebase-search-tool.test.ts` — schema absence checks.
* `test/codebase-search-live.test.ts` or SDK unit harness — verify one non-default limit.

### FR-8: Verify raw protocol tools behavior before patching request shape

The implementation must test Morph's official no-tools request path against the current SDK path that sends `TOOL_SPECS`. Any behavior change must be based on live evidence.

**Acceptance criteria:**

```gherkin
Given the same repo_structure and search_string are sent to Morph WarpGrep
When one request includes no tools array and one request includes TOOL_SPECS
Then the implementation records whether both produce usable tool_calls
And no SDK request-shape patch is merged without this result
```

**Files:**

* `test/codebase-search-live.test.ts` or a dedicated live script — raw protocol comparison.
* `docs/prd/PRD-002-warpgrep-sdk-flexibility.md` — record required evidence.
* `docs/architecture/plan-warpgrep-sdk-flexibility.md` — sequence the comparison before patch 7.

### FR-9: Keep Pi model-facing args minimal

`codebase_search` must expose only task-relevant search controls.

**Acceptance criteria:**

```gherkin
Given the codebase_search tool schema is inspected
When the schema fields are listed
Then they are searchTerm, repoRoot, includes, excludes, and searchType only
```

**Files:**

* `extensions/codebase-search-tool.ts` — schema update.
* `test/codebase-search-tool.test.ts` — schema snapshot/assertion.
* `README.md` — concise parameter docs.

---

## 6. Non-Functional Requirements

| Category                  | Requirement                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Security**              | API keys must never be printed by timing or live test scripts.                                                                      |
| **Context budget**        | Model-facing tool descriptions and parameter descriptions must stay concise; no SDK-internal tuning manual in tool metadata.        |
| **Performance**           | Added wrapper logic must not materially increase provider time; live timing should distinguish SDK/Morph time from local tool time. |
| **Compatibility**         | Existing `fast_apply`, `/morph-status`, `/morph-login`, and `/morph-probe` behavior must not regress.                               |
| **Patch maintainability** | SDK patch changes must be documented and covered by focused tests because pnpm patches are fragile across SDK upgrades.             |
| **Live verification**     | Any patch that changes API request body or search behavior must be tested live with `MORPH_API_KEY` before commit.                  |

---

## 7. Risks & Assumptions

### Risks

| Risk                                                            | Severity | Likelihood | Mitigation                                                                                                                            |
| --------------------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| SDK patch becomes too large and hard to rebase                  | High     | Medium     | Keep each patch area isolated; add tests around public behavior; document all seven patches here even if not implemented immediately. |
| Official docs and installed SDK disagree                        | Medium   | High       | Treat live API checks as source of truth; document conflicts before changing request shape.                                           |
| `includes` semantics differ between ripgrep and docs examples   | Medium   | Medium     | Use explicit fixtures and document glob semantics in README.                                                                          |
| `node_modules` search still fails from parent roots             | High     | Medium     | Build a fixture matrix covering parent root, package root, and direct node\_modules root before claiming support.                     |
| Model-facing schema expands too much                            | Medium   | Medium     | Enforce schema snapshot with only five allowed fields.                                                                                |
| Raw no-tools mode works differently from SDK tool specs         | Medium   | Unknown    | Compare both paths live before patching; keep current SDK behavior if both work and there is no benefit.                              |
| Redaction default change could leak local file content to Morph | Medium   | Medium     | Keep search-term preflight and document data flow; leave redaction code in place for opt-in or future policy.                         |

### Assumptions

* `@morphllm/morphsdk@0.2.171` remains the patch target for this work.
* Morph's current official WarpGrep model is `morph-warp-grep-v2.1`.
* There is no documented `auto` model for WarpGrep in the official docs currently available; this must be re-checked live before adding any auto behavior.
* Pi should expose search task controls, not SDK tuning controls, to the model.
* Local WarpGrep continues to use ripgrep through the SDK's `LocalRipgrepProvider`.

---

## 8. Design Decisions

### D1: Patch SDK-level WarpGrep behavior instead of Pi-only monkey patches

**Options considered:**

1. Patch SDK types/runtime — reusable, aligns with prior Fast Apply `auto` patch, but increases patch maintenance.
2. Implement Pi-only wrapper workarounds — faster locally, but leaves public SDK dead fields and hidden timings unresolved.
3. Drop to raw API protocol entirely — maximum control, but duplicates SDK agent loop and increases long-term drift.

**Decision:** Patch SDK-level behavior where the SDK already claims or internally supports the capability.

**Rationale:** The requested flexibility belongs at SDK level. Pi should not own a parallel WarpGrep agent loop unless SDK blocks required behavior after patching.

**Future path:** If upstream adopts equivalent patches, remove local pnpm patch hunks and keep tests.

### D2: Keep model-facing `codebase_search` schema small

**Options considered:**

1. Expose all SDK knobs to the model — maximum flexibility, high context/schema cost and misuse risk.
2. Expose only search task knobs — practical flexibility with low context cost.
3. Keep current two-field schema — smallest, but blocks include/exclude/node\_modules workflows.

**Decision:** Expose `searchTerm`, `repoRoot`, `includes`, `excludes`, and `searchType` only.

**Rationale:** Those fields affect what to search. Model, generation, timings, and limits affect how the engine runs and belong in runtime config/tests.

### D3: Treat provider as filesystem/search provider, not LLM provider

**Options considered:**

1. Avoid provider code entirely — simpler, but loses redaction/timing/wrapper and node\_modules control when SDK needs a wrapped local provider.
2. Keep a local provider wrapper for filesystem/search operations — supports timing/redaction/diagnostics, but must not be confused with LLM providers.
3. Add remote provider/sandbox abstraction now — too broad for current request.

**Decision:** Keep only the local filesystem/search provider wrapper needed by Pi; do not add remote/sandbox provider work.

**Rationale:** Morph remains the LLM/API backend. The provider wrapper executes local ripgrep/read/list/glob operations and may collect timings or apply local policy.

### D4: Verify raw protocol before changing SDK request shape

**Options considered:**

1. Remove `tools` from SDK requests because docs say built-in tools exist.
2. Keep `tools: TOOL_SPECS` because installed SDK works.
3. Test both live and decide from evidence.

**Decision:** Test both live before any request-shape patch.

**Rationale:** Docs/runtime mismatch is real. A speculative request-shape change could break working search.

---

## 9. File Breakdown

| File                                                 | Change type | FR                           | Description                                                                                                                 |
| ---------------------------------------------------- | ----------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `docs/prd/PRD-002-warpgrep-sdk-flexibility.md`       | New         | FR-1..FR-9                   | Requirements for all seven SDK patch areas and minimal Pi schema.                                                           |
| `docs/architecture/plan-warpgrep-sdk-flexibility.md` | New         | FR-1..FR-9                   | Sequenced implementation and live verification plan.                                                                        |
| `patches/@morphllm__morphsdk@0.2.171.patch`          | Modify      | FR-1..FR-8                   | SDK patches for timings, model, generation params, includes, search type/node\_modules, limits, and possibly request shape. |
| `extensions/codebase-search-tool.ts`                 | Modify      | FR-4, FR-5, FR-6, FR-9       | Minimal model-facing args and runtime wiring.                                                                               |
| `extensions/runtime-config.ts`                       | Modify      | FR-2, FR-3, FR-7             | Operator/runtime-level WarpGrep config wiring if implemented.                                                               |
| `test/codebase-search-tool.test.ts`                  | Modify      | FR-2..FR-7, FR-9             | Schema and wiring tests.                                                                                                    |
| `test/codebase-search-live.test.ts`                  | Modify      | FR-1, FR-4, FR-5, FR-6, FR-8 | Live Morph and fixture matrix tests.                                                                                        |
| `test/codebase-search-timing.ts`                     | Modify      | FR-1, FR-6                   | Report SDK timings and optional search type/includes/excludes.                                                              |
| `README.md`                                          | Modify      | FR-4, FR-5, FR-6, FR-9       | Concise user docs after behavior lands.                                                                                     |
| `ROADMAP.md`                                         | Modify      | FR-1..FR-9                   | Link new specdocs and summarize patch status.                                                                               |

---

## 10. Dependencies & Constraints

* `@morphllm/morphsdk@0.2.171` is patched locally through `pnpm-workspace.yaml` `patchedDependencies`.
* Official Morph docs used for this PRD: `https://docs.morphllm.com/llms-full.txt`, WarpGrep API, direct API, streaming, and tool pages.
* Live tests require `MORPH_API_KEY`; use `fnox get MORPH_API_KEY` locally and never commit secrets.
* `LocalRipgrepProvider` uses bundled `@vscode/ripgrep` first, then system `rg` fallback.
* Pi tool schema changes must follow progressive disclosure rules: concise descriptions, no internal tuning fields.

---

## 11. Rollout Plan

1. Save and validate this PRD and the implementation plan.
2. Patch SDK timings first; update timing harness and verify `sdkTimings` is non-null live.
3. Patch SDK config pass-through for model/generation/limits with tests, but do not expose those fields to `codebase_search`.
4. Patch includes/excludes/searchType/node\_modules behavior; build fixture matrix.
5. Update Pi tool schema with `includes`, `excludes`, and `searchType` only.
6. Run live public-repo and fixture searches for default vs node\_modules behavior.
7. Verify raw no-tools versus tool-spec request shape; decide whether to patch request shape or document no change.
8. Update README/ROADMAP with final implemented/deferred patch status.
9. Run full gate and commit.

---

## 12. Open Questions

| #  | Question                                                                                                           | Owner                 | Due                           | Status                                                                                                                                                                                                                                        |
| -- | ------------------------------------------------------------------------------------------------------------------ | --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1 | Does Morph WarpGrep support any documented or accepted `auto` model value?                                         | Victor Software House | Before SDK model patch commit | **Resolved:** No. Live recon: `morph-warp-grep-v2.1` and `morph-warp-grep-v1` accepted; `morph-warp-grep` deprecated; `auto` and `morph-warp-grep-auto` rejected. Default stays `morph-warp-grep-v2.1`.                                       |
| Q2 | Does the no-tools raw API request behave identically or better than the SDK's current `tools: TOOL_SPECS` request? | Victor Software House | Before patch 7                | **Resolved:** Identical behavior and token billing (`prompt_tokens: 1005` both shapes; cached\_tokens 960 warm). Median latency parity (895ms vs 893ms). No-tools saves \~2.6 KB upload per turn. Default flipped to `useBuiltinTools: true`. |
| Q3 | Should redaction default be disabled while keeping code available?                                                 | Victor Software House | During implementation         | Open                                                                                                                                                                                                                                          |
| Q4 | Should `excludes` replace SDK defaults exactly, or should Pi offer an additional merge mode later?                 | Victor Software House | During implementation         | Open                                                                                                                                                                                                                                          |
| Q5 | What is the smallest reliable node\_modules matrix that proves parent-root and package-root behavior?              | Victor Software House | During implementation         | Open                                                                                                                                                                                                                                          |

---

## 13. Related

| Issue                                                                                                          | Relationship                                                                           |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [PRD-001 Morph Runtime Integration](PRD-001-morph-runtime-integration.md)                                      | Source architecture that introduced local `codebase_search` and SDK patching precedent |
| [Plan: Morph Runtime Integration](../architecture/plan-morph-runtime-integration.md)                           | Prior plan containing Morph Search Tools workstream                                    |
| [ADR-0002 Straightforward Morph tool declarations](../adr/ADR-0002-straightforward-morph-tool-declarations.md) | Constraint for minimal direct model-facing tool shape                                  |

---

## 14. Changelog

| Date       | Change        | Author                |
| ---------- | ------------- | --------------------- |
| 2026-05-17 | Initial draft | Victor Software House |

---

## 15. Verification (Appendix)

Post-implementation live checks:

1. `pnpm run measure:codebase-search -- "Find Node.js CommonJS module loading and resolution implementation"` against the public `nodejs/node` clone and confirm non-null `sdkTimings`.
2. Run a fixture search where `includes` narrows results to `src/**/*.ts`.
3. Run a fixture search where `excludes` removes `dist` or another known directory.
4. Run node\_modules matrix:
   * root = fixture parent, searchType = `default`
   * root = fixture parent, searchType = `node_modules`
   * root = `packageA`, searchType = `default`
   * root = `packageA`, searchType = `node_modules`
   * root = `packageA/node_modules`, searchType = `default`
   * root = `packageA/node_modules`, searchType = `node_modules`
5. Run raw API comparison with and without `tools` array and record the observed behavior.
6. Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, and `pnpm run build`.
