# ROADMAP

`pi-fast-apply` roadmap. Source of truth: specdocs first, roadmap second.

Primary specdocs:

- [PRD: Morph Runtime Integration](docs/prd/PRD-001-morph-runtime-integration.md)
- [Plan: Morph Runtime Integration](docs/architecture/plan-morph-runtime-integration.md)
- [PRD: WarpGrep SDK Flexibility](docs/prd/PRD-002-warpgrep-sdk-flexibility.md)
- [Plan: WarpGrep SDK Flexibility](docs/architecture/plan-warpgrep-sdk-flexibility.md)
- [ADR-0001: Pi-owned file mutation for Morph Apply](docs/adr/ADR-0001-pi-owned-file-mutation-for-morph-apply.md)
- [ADR-0002: Straightforward Morph tool declarations](docs/adr/ADR-0002-straightforward-morph-tool-declarations.md)
- [ADR-0003: Pi auth storage for Morph secrets](docs/adr/ADR-0003-pi-auth-storage-for-morph-secrets.md)

Morph research inputs:

- [Morph llms-full](https://docs.morphllm.com/llms-full.txt) — reviewed 2026-04-07
- [Apply API](https://docs.morphllm.com/api-reference/endpoint/apply)
- [WarpGrep SDK](https://docs.morphllm.com/sdk/components/warp-grep/tool)
- [WarpGrep direct API](https://docs.morphllm.com/sdk/components/warp-grep/direct)
- [Compact SDK](https://docs.morphllm.com/sdk/components/compact)
- [Compact API](https://docs.morphllm.com/api-reference/endpoint/compact)
- [Router SDK](https://docs.morphllm.com/sdk/components/router)

---

## Current checkpoint

Released as `0.2.0`. All runtime work complete.

Completed work:

- Package scaffold, release baseline, lint/build hooks.
- Pi-native `quick_edit` tool (renamed from `fast_apply`) using Morph semantic merge. Default file editor; `edit` remains as fallback for trivial exact replacements.
- Pi-owned path resolution, mutation queueing, marker leak validation.
- New-file creation: writes `codeEdit` directly without API round-trip.
- `dryRun` removed from model-facing schema.
- `promptGuidelines` enforce marker-first usage.
- `/morph login`, `/morph logout`, `/morph status`, `/morph probe` auth/config commands.
- SDK patch for `@morphllm/morphsdk@0.2.171`: `auto` default, WarpGrep timings, model/temp/maxTokens/maxTurns/includes/useBuiltinTools.
- `codebase_search` tool: WarpGrep-backed semantic local search with `includes`, `excludes`, `searchType` schema; Secretlint + TruffleHog-derived redaction.
- `MORPH_EDIT` and `MORPH_WARPGREP` env feature flags for conditional tool registration.
- Live test suite: 7 scenarios × 3 runs, `toMatchSnapshot()`, inline marker probing, verbatim edge case.
- README and AGENTS.md current.

Verification evidence:

- Standard local gate passed: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run build`.
- Live Morph matrix: 10 scenarios × 10 API/SDK paths × 3 runs = 300/300 successful calls.
- Latest generated reports:
  - [Morph Apply behavior matrix](docs/morph-apply-behavior-matrix.md)
  - [Morph Apply scenarios](docs/morph-apply-scenarios.md)

---

## WarpGrep SDK flexibility (PRD-002) status

Implemented in `@morphllm/morphsdk@0.2.171` patch:

- SDK now returns internal `WarpGrepTimings` (`initial_state_ms`, per-turn `morph_api_ms`/`local_tools_ms`, `finish_resolution_ms`, `total_ms`) in `WarpGrepResult.timings`.
- `WarpGrepClientConfig` and `WarpGrepInput` accept optional `model`, `temperature`, `maxTokens`, `maxTurns`, and `useBuiltinTools` config (defaults: `morph-warp-grep-v2.1` / `0` / `2048` / `6` / `false`).
- `LocalRipgrepProvider` accepts `includes` options (ripgrep `-g` patterns), wired through `getLocalProvider`, `executeToolCall`, and `executeToolCallStreaming`.
- `useBuiltinTools` (default `true`) omits `tools: TOOL_SPECS` from the chat/completions request, matching Morph's official docs/cURL examples. Pass `false` to send the legacy explicit tools array.
- Pi `codebase_search` schema now exposes `includes`, `excludes`, and `searchType` only. Model selection, generation params, and limits stay in runtime/SDK config; no model-facing exposure.
- Pi provider wrapper auto-enables `allowNames: ['node_modules']` when `searchType === 'node_modules'` or when `repoRoot` is inside a `node_modules` tree.

Live evidence (matrix run on disposable fixture and `nodejs/node`):

- `sdkTimings` returned non-null end-to-end through `pnpm run measure:codebase-search`.
- Parent-root + `node_modules` mode returned `packageA/node_modules/cool-pkg/index.js`.
- Direct `packageA/node_modules/cool-pkg` root returned the package file with both `default` (because `allowNames` is set) and `node_modules` modes.
- Default mode excluded `node_modules` from parent root.

Live recon (Morph `/v1/chat/completions`):

- `morph-warp-grep-v2.1` works with and without a `tools` array; both produce `tool_calls`.
- `morph-warp-grep-v1` still accepted; `morph-warp-grep` deprecated.
- `auto` / `morph-warp-grep-auto` not accepted as WarpGrep models.
- Rigorous interleaved comparison (5 rounds, randomized order) showed median latency parity (895ms tools vs 893ms no-tools after warmup) and identical `prompt_tokens` (1005). Morph injects WarpGrep tool specs server-side regardless, so sending the local `TOOL_SPECS` is purely redundant upload (~2.6 KB per turn). Built-in tools mode now wins by ~16 KB upload per 6-turn search with zero latency or token billing impact.

Deferred (documented in [PRD-002](docs/prd/PRD-002-warpgrep-sdk-flexibility.md)):

- Exposing the remaining `AGENT_CONFIG` limits (`maxContextChars`, `maxOutputLines`, `maxListResults`, `maxReadLines`, `maxListDepth`, `listTimeoutMs`) at SDK level. Only `maxTurns` is exposed now; deeper coverage requires threading config into helpers and the local provider.

---

## Later work, ordered

### Public GitHub code search

Add separate tool, likely `github_code_search`, label `GitHub Code Search`.

Scope:

- Public GitHub repos only.
- Accept owner/repo or full GitHub URL plus optional branch.
- Return same bounded context shape as local search.
- Keep auth/private-repo handling out until separate security review.

### Explicit Compact hook

Wire Morph Compact into Pi’s explicit compaction lifecycle first.

Scope:

- Use `session_before_compact`.
- Query from recent user intent.
- Preserve system messages and recent turns.
- Fallback to Pi default compaction without breaking sessions.
- Show operator-visible before/after token counts and ratio.

### Search excerpt compaction experiment

After local search and explicit Compact work:

- Test Compact against large search/read outputs.
- Preserve byte-for-byte kept lines.
- Keep default conservative/off until proven.

### Optional tool-result compaction

Only after explicit Compact and search excerpt experiments prove safe.

Scope:

- Conservative thresholds.
- Skip mutation tools.
- Clear details in tool results.
- No silent behavior change that hides important errors.

### Router evaluation

Evaluate Morph Router only if `quick_edit` needs extra model-routing visibility beyond SDK default `auto`.

Current default:

- Do not expose model/large controls on `quick_edit`.
- Let patched SDK default send `auto`.

### Remote/sandbox search

Deferred. Needs separate safety design.

### Package rename

Deferred until package ships broader Morph capability beyond Fast Apply. Rename requires release migration plan and user-facing compatibility notes.

---

## Deferred / out of scope

| Feature                     | Reason                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| Embeddings + rerank pipeline | WarpGrep handles code search pipeline internally for current needs.    |
| Glance / computer use        | Pi package is terminal coding-agent integration, not browser testing.  |
| GenKit / VibeFrame           | React/component generation outside package purpose.                    |
| Repo Storage / MorphGit      | Pi already owns local git/filesystem; hosted repo state adds risk.     |
| Browser/mobile automation    | Not relevant to current coding-agent extension.                        |
| Tab prediction               | UI-specific, not relevant.                                             |

---

## Maintenance rules

- Specdocs drive durable decisions. Roadmap summarizes order only.
- No ad hoc phase codes.
- Keep tool names direct and model-obvious.
- Keep provider-visible descriptions short.
- Prefer local-first behavior before remote/hosted features.
- Before broad changes: update or create PRD/plan/ADR first.
