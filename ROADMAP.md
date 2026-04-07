# ROADMAP

Implementation slices for `pi-fast-apply` — Pi-native integration of the [Morph](https://morphllm.com) specialized model suite.

Source analysis: full review of [docs.morphllm.com/llms-full.txt](https://docs.morphllm.com/llms-full.txt) (18,801 lines, 2026-04-07).

---

## Completed

### PIM-001: Package scaffold and release baseline

Status: completed.

Establish the package metadata, extension entrypoint, lint gates, hooks, and release flow.

### PIM-002: Pi-native Morph edit tool

Status: completed.

`extensions/index.ts` registers a native `fast_apply` tool using the official Morph SDK (`@morphllm/morphsdk`). Path resolution and file mutation queueing stay inside Pi.

### PIM-003: Manual validation against real Morph credentials

Status: completed — re-verified 2026-04-03 with fixture corpus.

12 scenarios passed against a 10-file fixture corpus. Two bugs found and fixed.
Report: [`test/reports/2026-04-03-manual-validation.md`](test/reports/2026-04-03-manual-validation.md)

### PIM-004: Morph edit prompt contract and context-efficient tool metadata

Status: completed.

Tool metadata follows Morph's official guidance: first-person `instruction`, partial `codeEdit` with `// ... existing code ...` markers, routing policy distinguishing `fast_apply` from native `edit`/`write`.

### PIM-005: Morph auth configuration in Pi

Status: completed.

Auth chain: authStorage (auth.json via `/morph-login`) → `MORPH_API_KEY` env var. Commands: `/morph-login`, `/morph-logout`, `/morph-status`.

---

## Active roadmap

Priority order reflects the 2026-04-07 analysis of the full Morph API surface. Each item builds on the ones above it.

### PIM-006: WarpGrep native search tool

Status: next — no blockers.

Morph's WarpGrep (`morph-warp-grep-v2.1`) is a code search subagent that runs in an **isolated context window**. The main agent's context stays clean — no grep dumps polluting the conversation.

**Why it matters:** [Cognition measured](https://www.cognition.ai/blog/under-the-hood-how-devin-finds-the-right-code) agents spend 60% of turns searching. WarpGrep offloads this to a dedicated LLM that issues 8 parallel tool calls per turn and finds code in ~3.8 steps (~6 seconds). Paired with Opus on SWE-Bench Pro, it's [#1 at 15.6% cheaper and 28% faster](https://morphllm.com/blog/warpgrep-v2) than single-model approaches.

**Key protocol details:**

- Model has built-in tools: `grep_search`, `read`, `list_directory`, `glob`, `finish` — do NOT pass a `tools` array
- Input: `<repo_structure>` (flat absolute paths, depth 2) + `<search_string>` (natural language)
- Multi-turn loop: up to 6 turns, turn counter injected as `{role: "user"}` message
- Agent returns `finish` with `files` param: `path:lines` per line
- Pi executes tools locally: `grep_search` → `rg`, `read` → `fs`, `list_directory` → `find`, `glob` → file pattern matching
- Pricing: $0.80 / 1M input + $0.80 / 1M output

**Reference implementations:**
- [TypeScript SDK tool](https://docs.morphllm.com/sdk/components/warp-grep/tool) — `morph.anthropic.createWarpGrepTool()`
- [Python complete agent](https://docs.morphllm.com/guides/warp-grep-python) — full loop in ~200 lines
- [Direct API protocol](https://docs.morphllm.com/sdk/components/warp-grep/direct) — raw HTTP, tool definitions, output limits
- [Examples repo](https://github.com/morphllm/examples/tree/main/warpgrep) — 10 self-contained examples

**Acceptance criteria:**

- `warp_grep` registered as a Pi-native model-facing tool
- accepts `searchTerm` (required) and optionally `repoRoot` (defaults to CWD)
- runs the full multi-turn agent loop locally: initial message → execute tool calls → inject turn counter → repeat until `finish` or 6 turns
- `finish` result parsed; relevant file:line spans read and surfaced as tool output
- streaming step output shown in Pi TUI (turn number, tool calls being executed)
- tool metadata teaches official routing: use for broad semantic queries ("Find the XYZ flow"), NOT for exact keyword grep
- GitHub search mode deferred to PIM-012

### PIM-008: WarpGrep routing guidance

Status: pending — ships with or right after PIM-006.

All major Morph integrations (Claude Code, Cursor, Codex) inject routing guidance into the agent's memory so the LLM knows when to call WarpGrep vs native tools.

**Acceptance criteria:**

- `warp_grep` tool metadata includes `promptSnippet` and `promptGuidelines` matching Morph's official routing policy
- README includes a ready-to-paste AGENTS.md block:
  ```
  Fast Apply: Use fast_apply for scattered or fragile edits; use edit for small exact replacements and write for new files.
  Warp Grep: warp_grep is a search subagent. Use at the start of codebase explorations for broad semantic queries. Do not use for exact keyword searches; use native grep instead.
  ```
- the repo's own AGENTS.md carries this guidance once warp_grep ships

### PIM-009: Real-time Compact interception

Status: pending — blocked on PIM-006.

**The highest-value new feature identified in the API analysis.** Intercept large tool results (file reads, grep output, search context) *before* they reach the main LLM, and run them through Morph Compact to strip irrelevant lines.

**Why it matters:** Compact (`morph-compactor`) runs at 33,000 tok/s — 100K tokens compress in <2 seconds. 50-70% reduction. Every surviving line is byte-for-byte identical to the original (no rewriting, no paraphrasing). The `query` parameter makes compression intelligent: set it to the user's current task, and auth code stays while DB setup drops.

**Key capabilities from the API:**

- `POST /v1/compact` — native endpoint
- `POST /v1/chat/completions` with `model: "morph-compactor"` — OpenAI-compat
- `query` param: focus relevance scoring on what matters for the next LLM call
- `compression_ratio`: 0.3 for aggressive (long agent loops), 0.5 default, 0.7 for light
- `preserve_recent`: keep last N messages uncompressed (recommended: 3+)
- `<keepContext>` / `</keepContext>` tags: force-preserve wrapped sections verbatim regardless of ratio
- `compacted_line_ranges`: response tells you exactly which lines were removed
- `compress_system_messages: false` by default — system prompts survive
- 1M token context window

**Pi integration approach:**

Intercept at Pi's tool result rendering pipeline, not at `/compact` slash command time. When a tool result exceeds a configurable threshold (e.g. 2K tokens), compress it with Compact before it enters the conversation history. The user's last message text becomes the `query` param.

Design doc: [`docs/compact-interception.md`](docs/compact-interception.md)

**Reference:**
- [Compact SDK docs](https://docs.morphllm.com/sdk/components/compact) — full API reference, best practices, keepContext, edge runtime
- [Compact API endpoint](https://docs.morphllm.com/api-reference/endpoint/compact) — raw HTTP

**Acceptance criteria:**

- tool results above a configurable token threshold are compressed before entering conversation
- `query` is set from the user's current message or task context
- system messages and recent turns are never compressed
- `<keepContext>` injection is documented for operators
- operator-visible output: token count before/after, compression ratio, lines removed
- configurable via env vars: `MORPH_COMPACT_THRESHOLD`, `MORPH_COMPACT_RATIO`, `MORPH_COMPACT_PRESERVE_RECENT`
- silent no-op when `MORPH_API_KEY` is not set

### PIM-010: Explore subagent

Status: pending — blocked on PIM-006.

Wrap WarpGrep in an autonomous multi-search exploration loop on a cheap/fast model. The [Explore subagent](https://docs.morphllm.com/sdk/components/subagents) runs 2-8 WarpGrep searches in its own context, reasons about what to search next, and returns only a structured summary + code contexts to the primary agent.

**Why it matters:** WarpGrep (PIM-006) is a single-shot search. Understanding how a system works often takes 3-8 searches. The Explore subagent handles this loop autonomously on Haiku, then returns only the summary to the primary (expensive) agent.

**Unique capability — bidirectional messaging:** If the subagent hits a fork ("Found JWT and OAuth auth. Which should I focus on?"), it can **pause and ask** the main agent or the operator for clarification before continuing. The `send_message` tool blocks until a reply arrives.

**Reference:**
- [Subagents SDK](https://docs.morphllm.com/sdk/components/subagents) — Anthropic, Vercel AI SDK adapters
- Thoroughness levels: `quick` (1-2 searches), `medium` (2-4), `thorough` (4-8)
- Result shape: `{ success, summary, contexts: WarpGrepContext[], searchCount, durationMs }`

**Acceptance criteria:**

- `explore` registered as a Pi-native tool
- runs the Explore subagent loop using a configurable cheap model (default: Haiku)
- surfaces step progress in Pi TUI (search N of M, current search term)
- pause-and-ask messages are presented to the operator for response
- returns structured summary + code contexts as tool output
- configurable thoroughness level

### PIM-011: Model Router

Status: pending — no hard blockers.

Expose Morph's [Router](https://docs.morphllm.com/sdk/components/router) (`morph-routers`) as an internal decision layer for `fast_apply`. Instead of always using `morph-v3-fast` or requiring operator configuration, classify each edit's complexity in ~430ms and route to the optimal model.

**Router capabilities:**

- $0.001/request, ~430ms latency
- Returns: `{ model: "morph-v3-fast" }` or `{ model: "morph-v3-large" }`
- Raw mode: `{ difficulty: "easy" | "medium" | "hard" | "needs_info" }`
- Modes: `balanced` (default) vs `aggressive` (cost-optimize)
- Max input: 8,192 tokens

**Reference:**
- [Router SDK docs](https://docs.morphllm.com/sdk/components/router)

**Acceptance criteria:**

- `fast_apply` optionally uses the Router to select between `morph-v3-fast` and `morph-v3-large`
- enabled via `MORPH_ROUTER_MODE=balanced|aggressive|off` (default: `off` for backward compat)
- operator-visible output shows which model was selected and why
- fallback to `morph-v3-fast` if Router call fails
- raw difficulty classification available for extension consumers

### PIM-012: GitHub remote search

Status: pending — blocked on PIM-006.

Add a `github_search` tool that searches **public GitHub repos without cloning**. Morph clones and indexes the repo on their servers. Same `WarpGrepResult` format as local search.

**Reference:**
- [GitHub Search docs](https://docs.morphllm.com/sdk/components/warp-grep/github-search) — `morph.warpGrep.searchGitHub()`
- SDK: `morph.anthropic.createGitHubSearchTool()`

**Acceptance criteria:**

- `github_search` registered as a Pi-native tool
- accepts `searchTerm` (required) + `github` (owner/repo or full URL) + optional `branch`
- returns the same structured code context format as `warp_grep`
- tool metadata teaches: use for exploring library internals, finding usage patterns, pulling reference implementations from repos not cloned locally

### PIM-007: Compact lifecycle-hook (`/compact`)

Status: pending — lower priority after PIM-009.

Wire Morph Compact into Pi's `PreCompact` lifecycle hook for manual `/compact` invocations. This is the *explicit* compaction path (operator triggers it). PIM-009 is the *implicit* path (automatic on every tool result).

**Acceptance criteria:**

- Compact wired to Pi's `PreCompact` lifecycle hook
- `query` set to last user message text
- configurable `compression_ratio` and `preserve_recent` via env vars
- `<keepContext>` tag injection documented
- operator-visible output: token reduction, compression ratio, lines removed
- system messages not compressed by default
- silent fallback to Pi's default compaction when `MORPH_API_KEY` is not set

---

## Deferred / out of scope

| Feature | Morph product | Why deferred |
|:--|:--|:--|
| Embeddings + Rerank pipeline | `morph-embedding-v4` + `morph-rerank-v4` | WarpGrep handles the search pipeline internally. Standalone embedding/rerank adds value for persistent indexes, but overkill for a Pi extension. |
| Glance (vision testing) | `morph-computer-use-v1` | Pi is a terminal agent; browser testing is out of scope. |
| GenKit / VibeFrame | Vibe Compiler, VibeArtifact | React component generation — not relevant. |
| Repo Storage (MorphGit) | AI-native git | Pi already has git. Adds value only for Morph-hosted repos. |
| Report API | `POST /api/report` | Low priority but useful — auto-report failed edits. Could be added later as a quality-of-life improvement. |
| Browser/Mobile automation | `morph-computer-use-v0/v1` | Not relevant to a coding agent extension. |
| Tab Next Action Prediction | rrweb prediction model | UI-specific, not relevant. |
