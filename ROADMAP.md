# ROADMAP

`pi-fast-apply` roadmap. Source of truth: specdocs first, roadmap second.

Primary specdocs:

- [PRD: Morph Runtime Integration](docs/prd/PRD-001-morph-runtime-integration.md)
- [Plan: Morph Runtime Integration](docs/architecture/plan-morph-runtime-integration.md)
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

Fast Apply runtime slice is complete and verified.

Completed work:

- Package scaffold, release baseline, lint/build hooks.
- Pi-native `fast_apply` tool using Morph semantic merge.
- Pi-owned path resolution, mutation queueing, dry-run diff, marker leak validation.
- `/morph-login`, `/morph-logout`, `/morph-status` auth/config commands.
- SDK patch for `@morphllm/morphsdk@0.2.171` so omitted Apply model selection sends `auto`.
- `/morph-probe` runtime diagnostics.
- Runtime split into focused modules under `extensions/`.
- Minimal workspace path guard, Secretlint-backed codebase search content redaction, and sensitive container content omission.
- Vitest coverage for runtime config, workspace guards, and live Morph Apply matrix.
- README docs for auth, probe, Fast Apply contract, and inline placeholder pattern.

Verification evidence:

- Standard local gate passed: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run build`.
- Live Morph matrix passed through `mise run test:morph-matrix`: 10 scenarios × 10 API/SDK paths × 3 runs = 300/300 successful calls.
- Latest generated reports:
  - [Morph Apply behavior matrix](docs/morph-apply-behavior-matrix.md)
  - [Morph Apply scenarios](docs/morph-apply-scenarios.md)

Known caveat:

- Non-interactive Pi `-p` slash-command checks load the extension only with `--no-extensions`, because the globally installed package also registers `fast_apply`. `/morph-status` and `/morph-probe` produced no visible output in that print-mode path, likely because command output is notification/UI-backed. Live API behavior is covered by helper tests and matrix.

---

## Current: local `codebase_search`

Priority: highest.

Local Morph WarpGrep is available as a Pi-native model-facing tool named `codebase_search`, label `Codebase Search`.

Why next:

- It improves context gathering before adding more advanced Morph runtime features.
- It keeps search local-first: Pi executes filesystem reads/searches; Morph handles semantic search planning.
- It matches the implementation plan’s Morph Search Tools workstream and ADR-0002’s straightforward tool declaration rule.

Scope:

- Local repo/workspace search only.
- No GitHub search.
- No remote/sandbox search.
- No activator stub.
- Minimal schema.
- Bounded file:line/code contexts.
- Streaming progress when SDK supports it.

Expected model-facing shape:

| Field        | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Tool name    | `codebase_search`                                                     |
| Label        | `Codebase Search`                                                     |
| Primary arg  | `searchTerm` — natural-language question about current codebase       |
| Optional arg | `repoRoot` only if needed; default current workspace/repo root         |
| Output       | Bounded relevant files with line ranges and code/context snippets      |
| Non-goal     | Exact keyword/regex search; native `grep`/`find` remain better there   |

Acceptance:

- Tool registered from the extension with concise description and prompt guidance.
- Uses existing Morph auth/config helpers.
- Uses high-level SDK path first if it allows bounded output and progress rendering.
- Falls back to direct WarpGrep protocol only if SDK blocks required Pi behavior.
- Reads only local workspace/repo paths.
- Rejects secret-like `searchTerm` values before Morph receives them with Secretlint plus TruffleHog-derived preflight detection.
- Redacts detected secret values with Secretlint before WarpGrep context reaches Morph.
- Omits content from high-risk secret container paths when `read`/`grep` touches them.
- Keeps redaction enabled by default with `CODEBASE_SEARCH_REDACTION=0` opt-out for synthetic debugging.
- Keeps WarpGrep default discovery behavior for list/glob output.
- Returns compact structured output, not raw grep dumps.
- Unit or harness tests cover argument validation, path bounds, redaction, and output bounds.
- Manual search in this repo finds runtime/auth symbols with useful file:line context.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run build` pass.
- `pnpm run measure:codebase-search -- "<query>"` measures live WarpGrep wall time, SDK timing metrics, and provider operation timings against a chosen repo.

---

## Then: verification for `codebase_search`

After implementation:

- Manual/live search in this repo must find runtime/auth symbols with useful bounded file:line context.
- `/morph-probe`: add skipped/implemented search health check only if low-cost and useful.
- Tests: keep exact string search guidance pointed at native `grep`/`find`.
- Standard local gate must pass: `pnpm run typecheck`, `pnpm run lint`, `pnpm run test`, `pnpm run build`.

Docs must avoid prompt bloat. Tool metadata should explain routing in one or two direct sentences, not a mini-manual.

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

Evaluate Morph Router only if `fast_apply` needs extra model-routing visibility beyond SDK default `auto`.

Current default:

- Do not expose model/large controls on `fast_apply`.
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
