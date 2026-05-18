---
title: "Public GitHub Code Search"
prd: PRD-005
status: Draft
owner: "Victor Software House"
issue: "N/A"
date: 2026-05-18
version: "0.1"
---

# PRD: Public GitHub Code Search

---

## 1. Problem & Context

`pi-fast-apply` currently provides two Morph-backed tools:

- `quick_edit` — semantic file merge for local edits
- `codebase_search` — WarpGrep over the local workspace via `LocalRipgrepProvider`

Neither tool can reach public GitHub repositories. When an operator wants to explore
a third-party dependency, investigate an upstream bug, or compare how several
open-source projects implement the same pattern, the only option is to clone the
repo manually and run `codebase_search` against the clone — or accept a
low-signal `grep` over `node_modules`.

The Morph SDK exposes a purpose-built server-side analog: `createGitHubSearchTool()`,
which runs WarpGrep against public GitHub repos in the cloud, requires no local clone,
no ripgrep, and no GitHub token. It returns the same `WarpGrepResult` shape as local
search. The infrastructure is already wired — auth, config, redaction, result bounds,
and the Pi tool registration pattern all transfer directly from `codebase_search`.

### Comparison with Morph's own MCP server (`@morphllm/morphmcp`)

Morph's official MCP integration ships a `github_codebase_search` tool with a fixed
schema: takes `owner/repo` plus a natural-language query, executes cloud-side via
`createGitHubSearchTool()`, and returns WarpGrep results. No local ripgrep required.
The tool description in the MCP server reads:

> WarpGrep exploration for public GitHub repositories — no clone required.
> Takes `owner/repo` plus a natural-language query. Use when debugging third-party
> dependencies or investigating upstream bugs.

Pi's equivalent (`github_code_search`) follows the same contract but integrates with
Pi's auth chain, workspace guard, runtime config, output bounds, and Secretlint
redaction pipeline — things the MCP server does not provide.

### Comparison with the opencode Morph plugin

Community plugins for opencode (e.g. `AdisonCavani/opencode-morph-plugin`) expose
local WarpGrep search as `codebase_search` but do not register a GitHub search tool.
GitHub search is a gap in the entire community plugin space, not just this package.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| **Model can search public GitHub repos** | Tool registered and callable with `owner/repo` + natural-language query | Passes `/morph probe` GitHub search check |
| **Same UX as local search** | Result shape, bounds, and renderResult identical to `codebase_search` | No schema or rendering divergence |
| **No new auth surface** | Tool uses existing Morph API key only | No `GITHUB_TOKEN`, no `gh` CLI dependency |
| **Cloud-side execution** | No local ripgrep or clone required | Works from a fresh environment with only `MORPH_API_KEY` |

**Guardrails (must not regress):**

- `codebase_search` local behavior unchanged.
- `quick_edit` behavior unchanged.
- `MORPH_EDIT` and `MORPH_WARPGREP` feature flags still work.
- Existing `/morph` command family unchanged.
- Pi mutation queue and workspace guard for local tools unchanged.

---

## 3. Users & Use Cases

### Primary: Pi operator investigating a third-party dependency

> As a Pi operator, I want to search a public GitHub repo by natural-language query
> so that I can understand how a dependency works without cloning it locally.

**Preconditions:** Morph API key configured. No GitHub token needed.

### Secondary: Pi operator comparing upstream implementations

> As a Pi operator, I want to ask the model to search multiple public repos for the
> same pattern so that I can understand how different projects approach the same
> problem.

### Future: Private repo search (enabled by this work)

> As a Pi operator with GitHub auth configured, I want to search private
> repositories I have access to.

Private repo support is explicitly out of scope here but the design should make
it addable without restructuring the tool (see D1).

---

## 4. Scope

### In scope

1. **`github_code_search` tool** — Pi-native model-facing tool backed by
   `morph.openai.createGitHubSearchTool()` (or the equivalent low-level SDK call).
2. **`MORPH_GITHUB_SEARCH` feature flag** — env-gated registration, consistent with
   `MORPH_EDIT` and `MORPH_WARPGREP`.
3. **Same output bounds as `codebase_search`** — 8 contexts, 120 lines/context,
   24 KB total, Secretlint redaction on results.
4. **`/morph probe` GitHub search health check** — skip if flag off; pass/fail/error
   with actionable message.
5. **`codeSearchUrl` runtime config** — allow overriding the cloud code storage URL
   via env var, consistent with `MORPH_API_URL` pattern (hidden from model).

### Out of scope / later

| What | Why | Tracked in |
|---|---|---|
| Private GitHub repo search | Requires GitHub auth surface (token/OAuth), separate security review | Future PRD |
| Branch/ref/tag selection | Morph's `createGitHubSearchTool()` searches the default branch; no evidence of ref param in SDK | Revisit when SDK exposes it |
| Rate limit backoff / retry | Morph API handles quota server-side; client-side retry adds complexity without clear need | Revisit if production evidence appears |
| `includes`/`excludes` path filtering | GitHub search runs server-side; local ripgrep path filter patterns do not apply | Revisit when/if SDK exposes path hints |
| Multi-repo comparison in one tool call | Model can call the tool multiple times; batching not needed at the tool layer | N/A |

### Design for future (build with awareness)

The `GitHubSearchConfig` in `runtime-config.ts` should accept an optional
`githubToken?: string` field (resolved from env, not exposed to model) so private
repo support can be added later by passing it into the SDK call without restructuring
the config layer.

---

## 5. Functional Requirements

### FR-1: `github_code_search` tool registered when `MORPH_GITHUB_SEARCH` is not `false`

A Pi-native model-facing tool named `github_code_search` with label
`GitHub Code Search` is registered by the extension at startup when the
`MORPH_GITHUB_SEARCH` environment variable is not set to `false`.

**Acceptance criteria:**

```gherkin
Given MORPH_API_KEY is set and MORPH_GITHUB_SEARCH is unset
When Pi loads the extension
Then "github_code_search" appears in pi.getAllTools()

Given MORPH_GITHUB_SEARCH=false
When Pi loads the extension
Then "github_code_search" does NOT appear in pi.getAllTools()
```

**Files:**
- `extensions/github-code-search-tool.ts` — tool definition, execute(), renderCall(), renderResult()
- `extensions/index.ts` — conditional registration via `envEnabled('MORPH_GITHUB_SEARCH')`

---

### FR-2: Tool schema — `repo` + `searchTerm`

The model-facing schema has two parameters:

| Param | Type | Required | Description |
|---|---|---|---|
| `repo` | `string` | ✔ | Public GitHub repository in `owner/repo` format (e.g. `"vercel/next.js"`) |
| `searchTerm` | `string` | ✔ | Natural-language question about the repository |

No model-facing config or auth params.

**Acceptance criteria:**

```gherkin
Given a tool call with repo="vercel/next.js" and searchTerm="How does middleware work?"
When the tool executes
Then a WarpGrep search runs against the vercel/next.js GitHub repo
And the result contains file paths and line-range snippets from that repo

Given a tool call with repo="not/a-real-repo-xyz123" and searchTerm="anything"
When the tool executes
Then the tool returns a clear error message (not a crash)
```

**Files:**
- `extensions/github-code-search-tool.ts`

---

### FR-3: Cloud-side execution via Morph SDK

Tool uses `createGitHubSearchTool()` from `@morphllm/morphsdk` (via
`morph.openai` adapter or equivalent direct call). No local ripgrep involved.
No GitHub token required for public repos.

**Acceptance criteria:**

```gherkin
Given MORPH_API_KEY is valid and ripgrep is NOT installed
When the model calls github_code_search
Then the search completes successfully
```

**Files:**
- `extensions/github-code-search-tool.ts` — SDK call
- `extensions/runtime-config.ts` — `GitHubSearchConfig` with `codeSearchUrl` and `timeout`

---

### FR-4: Output bounds and redaction consistent with `codebase_search`

Results are bounded to 8 contexts, 120 lines per context, 24 KB total. Secretlint
redaction runs on result content. Output format is identical to `codebase_search`:
`<file path="..." lines="N-M">` blocks with snippet content.

**Acceptance criteria:**

```gherkin
Given a search that returns more than 8 context blocks
When the result is formatted
Then at most 8 blocks appear in the model-facing content
And a truncation note is included

Given result content containing a value matching a Secretlint secret pattern
When the result is formatted
Then the matched value is redacted before reaching model content
```

**Files:**
- `extensions/github-code-search-tool.ts` — reuses `MAX_CONTEXTS`, `MAX_CONTEXT_LINES`, `MAX_TOTAL_CHARS`, redaction logic from `codebase-search-tool.ts`

---

### FR-5: `/morph probe` includes GitHub search check

The existing `/morph probe` command gains a GitHub search health check. The check
is skipped (reported as `skipped`) when `MORPH_GITHUB_SEARCH=false`. It runs a
minimal query against a well-known small public repo (e.g.
`morphllm/morphsdk` or `sindresorhus/is`) and reports `pass`/`fail`/`error`
with an actionable failure message.

**Acceptance criteria:**

```gherkin
Given MORPH_GITHUB_SEARCH is unset and MORPH_API_KEY is valid
When the operator runs /morph probe
Then the GitHub search check reports "pass" with latency

Given MORPH_GITHUB_SEARCH=false
When the operator runs /morph probe
Then the GitHub search check reports "skipped (MORPH_GITHUB_SEARCH=false)"
```

**Files:**
- `extensions/commands.ts`

---

### FR-6: `MORPH_GITHUB_SEARCH_URL` runtime config

An optional `MORPH_GITHUB_SEARCH_URL` env var overrides the `codeSearchUrl` passed
to the SDK (the code storage service URL, distinct from `MORPH_API_URL`). Not
model-visible.

**Acceptance criteria:**

```gherkin
Given MORPH_GITHUB_SEARCH_URL=https://custom.example.com
When the tool initializes its SDK config
Then codeSearchUrl is set to "https://custom.example.com"
```

**Files:**
- `extensions/runtime-config.ts`

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Latency** | GitHub search inherits WarpGrep cloud latency (6–14 s typical). No local latency budget; doc-comment the expected range. |
| **No new auth surface** | Only `MORPH_API_KEY` required. No `GITHUB_TOKEN` stored or transmitted by this tool. |
| **Error transparency** | Network errors, invalid repo format, and Morph API errors all produce user-readable messages, not thrown exceptions that crash the tool row. |
| **Progressive disclosure** | Tool description and promptSnippet stay under Pi native budget (~175 tokens total). Heavy guidance stays in the `codebase-search` skill. |
| **SDK version parity** | GitHub search SDK call must work with the same `@morphllm/morphsdk@0.2.171` patch that local search uses. No new SDK patch required. |

---

## 7. Risks & Assumptions

### Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Morph cloud GitHub search becomes unavailable or changes URL | Medium | Low | `MORPH_GITHUB_SEARCH_URL` override and clear error messaging in probe |
| SDK `createGitHubSearchTool()` internal interface changes with morphsdk upgrade | Medium | Medium | Pin `@morphllm/morphsdk@0.2.171`; document in ROADMAP patch area |
| Model confuses `github_code_search` with `codebase_search` | Low | Low | Distinct name, distinct promptSnippet emphasising "public GitHub" vs "local workspace" |
| Sensitive data in public repo results (leaked secrets committed to public repos) | Low | Low | Secretlint redaction already planned (FR-4); CODEBASE_SEARCH_REDACTION=0 opt-out for debugging |

### Assumptions

- `createGitHubSearchTool()` from `@morphllm/morphsdk` works with the existing patched version `0.2.171`. To verify before implementation.
- Public GitHub repos do not require a GitHub token via the Morph cloud path.
- The `codeSearchUrl` option maps to `https://morphllm.com` by default per Morph docs.
- Result format is `WarpGrepResult` (same as local), so `buildSearchDetails()` from `codebase-search-tool.ts` is reusable.

---

## 8. Design Decisions

### D1: Tool name `github_code_search` vs `github_codebase_search`

**Options considered:**

1. `github_codebase_search` — matches Morph MCP naming exactly; zero ambiguity for users who know the MCP server.
2. `github_code_search` — shorter, avoids "codebase" which implies local workspace context.

**Decision:** `github_code_search`

**Rationale:** "Codebase" carries a local-workspace connotation that `codebase_search`
already owns. `github_code_search` signals "GitHub" + "code" without implying local.
The MCP naming is an implementation detail, not a contract.

---

### D2: Reuse `codebase-search-tool.ts` internals vs. duplicate

**Options considered:**

1. Copy `buildSearchDetails`, bounds constants, and redaction into new file — isolated but drifts.
2. Extract shared logic into `extensions/search-utils.ts`, import from both tools.
3. Import directly from `codebase-search-tool.ts` in the new file.

**Decision:** Extract shared logic into `extensions/search-utils.ts`.

**Rationale:** Two tools sharing the same bounds and formatting logic should share
the source. Direct import between tool files creates a non-obvious dependency. A
utility module is the clean boundary.

**Future path:** A third search tool (private repos, GitHub enterprise) imports from
the same `search-utils.ts` without any restructuring.

---

### D3: `repo` param format — `owner/repo` string vs. structured object

**Options considered:**

1. Single `repo: string` in `owner/repo` format — simpler schema, model handles
   formatting, matches Morph MCP contract.
2. Separate `owner: string` and `repo: string` params — explicit, validated, but
   verbose schema.

**Decision:** Single `repo: string`.

**Rationale:** The Morph SDK and MCP both use `owner/repo` as the unit. Splitting
it adds schema noise without aiding the model. Validation at the execute layer
handles malformed input.

---

### D4: Search-term preflight secret detection

**Options considered:**

1. Apply same TruffleHog-derived `searchTerm` preflight as `codebase_search` — reject
   if `searchTerm` looks like a secret.
2. Skip preflight — GitHub repos are public, searching for a secret string in public
   code is not a credential leak.

**Decision:** Apply preflight (option 1).

**Rationale:** The preflight guards against the model accidentally leaking a
runtime secret via the search term, not against searching for secrets in public code.
The risk is operator credentials appearing in a Morph API request, which is
independent of whether the target repo is public.

---

## 9. File Breakdown

| File | Change type | FR | Description |
|---|---|---|---|
| `extensions/github-code-search-tool.ts` | New | FR-1, FR-2, FR-3, FR-4 | Tool definition, schema, execute(), renderCall(), renderResult() |
| `extensions/search-utils.ts` | New | FR-2, FR-4 | Shared bounds, `buildSearchDetails()`, context formatting extracted from `codebase-search-tool.ts` |
| `extensions/codebase-search-tool.ts` | Modify | FR-4 | Import shared logic from `search-utils.ts` instead of defining inline |
| `extensions/index.ts` | Modify | FR-1 | Register `github_code_search` via `envEnabled('MORPH_GITHUB_SEARCH')` |
| `extensions/runtime-config.ts` | Modify | FR-3, FR-6 | Add `GitHubSearchConfig` with `codeSearchUrl`, `timeout`; read `MORPH_GITHUB_SEARCH_URL` |
| `extensions/commands.ts` | Modify | FR-5 | Add GitHub search health check to `/morph probe` |
| `test/github-code-search-tool.test.ts` | New | FR-1, FR-2, FR-4 | Unit tests: schema validation, workspace path irrelevance, output bounds, redaction |
| `README.md` | Modify | FR-1, FR-2 | Document `github_code_search`, `MORPH_GITHUB_SEARCH`, `MORPH_GITHUB_SEARCH_URL` |
| `ROADMAP.md` | Modify | — | Move "Public GitHub code search" from Later to completed once shipped |

---

## 10. Dependencies & Constraints

- `@morphllm/morphsdk@0.2.171` (pinned, patched) — must expose `createGitHubSearchTool()` or equivalent direct call. **Verify before implementation.**
- `MORPH_API_KEY` — required at runtime; existing auth chain handles resolution.
- No `ripgrep` dependency — cloud execution.
- No `GITHUB_TOKEN` — public repos only.
- Morph code storage service at `https://morphllm.com` (default `codeSearchUrl`) — external service availability.

---

## 11. Rollout Plan

1. Extract `search-utils.ts` from `codebase-search-tool.ts`; gate passes.
2. Implement `github-code-search-tool.ts`; unit tests pass.
3. Wire registration in `index.ts` and config in `runtime-config.ts`; gate passes.
4. Add probe check in `commands.ts`; gate passes.
5. Update README; bump to `0.3.0`; tag and push.

---

## 12. Open Questions

| # | Question | Owner | Due | Status |
|---|---|---|---|---|
| Q1 | Does `@morphllm/morphsdk@0.2.171` export `createGitHubSearchTool()` or does it need a new patch? | VSH | Before implementation | Open |
| Q2 | Is the `codeSearchUrl` default `https://morphllm.com` or `https://api.morphllm.com`? Docs show both hostnames in different contexts. | VSH | Before implementation | Open |
| Q3 | Does GitHub search via Morph cloud enforce a per-request or per-minute rate limit that the client needs to surface? | VSH | Before implementation | Open |

---

## 13. Related

| Issue | Relationship |
|---|---|
| PRD-001: Morph Runtime Integration | Completed — established Pi-native WarpGrep foundation this builds on |
| PRD-002: WarpGrep SDK Flexibility | Completed — SDK patch and `codebase_search` schema that this mirrors |
| ROADMAP "Public GitHub code search" | Source requirement — moves to completed on ship |

---

## 14. Changelog

| Date | Change | Author |
|---|---|---|
| 2026-05-18 | Initial draft | VSH |

---

## 15. Verification (Appendix)

1. `/morph probe` reports GitHub search check as `pass` with wall-time latency.
2. Ask the model to search `vercel/next.js` for "how does middleware work" — verify result contains file paths under the Next.js repo with relevant code snippets.
3. Ask the model to search `expressjs/express` and `honojs/hono` for the same pattern — verify two separate tool calls, each returning different file paths.
4. Set `MORPH_GITHUB_SEARCH=false` — verify tool absent from model-visible tool list.
5. Set `CODEBASE_SEARCH_REDACTION=0` — verify tool still works (opt-out only disables Secretlint, not the whole tool).
6. Provide a malformed `repo` value like `"not-a-repo"` — verify clean error message, no crash.
