# ROADMAP

This roadmap defines the first implementation slices for `pi-fast-apply`.

## PIM-001: Package scaffold and release baseline

Status: completed.

Establish the package metadata, extension entrypoint, lint gates, hooks, and release flow.

Acceptance criteria:

- root package metadata matches the intended `pi-fast-apply` package identity
- `pi.extensions` points at `./extensions`
- lint, typecheck, hook, and release files are present and working
- `assets/` exists for pi.dev preview imagery
- the repo can install dependencies and pass `bun run typecheck` and `bun run lint`

## PIM-002: Pi-native Morph edit tool

Status: completed.

Implement a native Pi extension surface for Fast Apply editing.

Acceptance criteria:

- `extensions/index.ts` registers a native `fast_apply` tool
- the tool keeps path resolution and file mutation queueing inside Pi
- the implementation uses the official Morph SDK directly rather than treating MCP as the primary native path
- dry-run behavior is supported
- failures produce actionable operator-visible messages

## PIM-003: Manual validation against real Morph credentials

Status: completed — re-verified 2026-04-03 with fixture corpus.

Validate the edit flow against a real Morph environment.

Acceptance criteria:

- `fast_apply` is exercised with a real `MORPH_API_KEY`
- a dry run and a real write both succeed on a temporary file
- the verified behavior is documented in the repo
- any limitations discovered during validation are turned into explicit follow-up items

Re-verification (2026-04-03): 12 scenarios passed against a 10-file fixture corpus.
Two bugs found and fixed (BUG-001, BUG-002). Full report:
[`test/reports/2026-04-03-manual-validation.md`](test/reports/2026-04-03-manual-validation.md)

## PIM-004: Morph edit prompt contract and context-efficient tool metadata

Status: completed.

Refine `fast_apply` so its `registerTool()` metadata is context-efficient, Pi-native, and aligned with Morph's own guidance for high-quality partial-edit prompting.

Acceptance criteria:

- `fast_apply` keeps a small, disciplined model-facing schema and does not grow a kitchen-sink parameter surface without strong evidence
- the tool `description` is short and decision-oriented, explaining when to use `fast_apply` and how it differs from native `edit` and `write`
- the tool `promptSnippet` stays a single concise line suitable for Pi's `Available tools` section
- the tool `promptGuidelines` stay intentionally short and encode the most important Morph-native editing rules rather than restating a long manual
- the tool metadata explicitly teaches the model to use first-person `instruction` text
- the tool metadata explicitly teaches the model to provide only changed regions plus `// ... existing code ...` markers in `codeEdit`
- the tool metadata and docs teach partial semantic editing rather than exact-string replacement thinking
- the package docs and examples reinforce the same routing guidance used by the tool metadata so the operator-visible contract stays consistent
- the package preserves the separate `fast_apply` tool shape instead of overriding native `edit`, and it includes clear fallback guidance back to native tools when Morph is not the right choice or is unavailable
- the final prompt/tool-contract wording is checked against official Morph guidance and the `opencode-morph-plugin` routing policy so the Pi package follows the same core decision model without copying unnecessary verbosity

Suggested starting point for the tool prompt contract, adapted from Morph's own Fast Apply guidance and the `morphllm/opencode-morph-plugin` routing policy:

- `description`: "Edit an existing file using partial code snippets with '// ... existing code ...' markers. Use fast_apply for multiple scattered changes in one existing file, complex refactors, or edits where exact oldText matching would be fragile. Use edit for small exact replacements and write for new files."
- `promptSnippet`: "Use fast_apply for scattered or fragile edits in existing files; use edit for small exact replacements and write for new files."
- `promptGuidelines`:
  1. "Write instruction in first person and make it specific, for example: 'I am adding input validation to the add function.'"
  2. "In codeEdit, include only the changed sections and wrap unchanged sections with '// ... existing code ...' markers instead of rewriting the whole file."
  3. "Include enough unique surrounding context to anchor each change precisely, preserve exact indentation, and use edit instead when the change is just a small exact replacement."

## PIM-005: Morph auth configuration in Pi

Status: completed.

Add a first-class Pi-native auth path for Morph that fits Pi's existing credential storage model while preserving the current environment-variable workflow.

Acceptance criteria:

- the package provides an operator flow to configure Morph credentials directly from Pi instead of requiring external environment setup only
- credentials can be stored through Pi's existing auth storage path (`auth.json` via `ctx.modelRegistry.authStorage`) rather than inventing a parallel package-local store
- the package keeps the existing environment-based workflow working so fnox-injected `MORPH_API_KEY` remains a valid path
- key resolution priority and fallback behavior are documented and verified
- the package provides a way to remove stored Morph credentials cleanly
- the implementation documents why it follows Pi's auth storage conventions, and if a stronger-at-rest option such as age/keychain/fnox remains preferable, that trade-off is stated explicitly

Implementation notes:

- Provider key: `morph` in auth.json
- Resolution chain: authStorage (runtime override + auth.json) -> MORPH_API_KEY env var
- Pi's built-in `getEnvApiKey()` uses a hardcoded provider map that does not include `morph`, so the env var fallback is an explicit `process.env` check
- Commands: `/morph-login <key>`, `/morph-logout`, `/morph-status` (updated to show active auth source)
- Security trade-off documented in README: auth.json uses 0600 permissions; fnox/keychain remains preferable for at-rest encryption

## PIM-006: WarpGrep native search tool

Status: next — no blockers.

Add Morph's WarpGrep semantic-search subagent as a Pi-native tool (`warp_grep`).

Background from official docs:

- Model: `morph-warp-grep-v2.1`
- Built-in tools: `grep_search`, `read`, `list_directory`, `glob`, `finish` — NOT passed in the request; model calls them, operator executes locally
- Multi-turn loop up to 6 turns; turn counter injected as a `{role: "user"}` message before each loop iteration
- Input format: `<repo_structure>` flat absolute paths to depth 2, then `<search_string>` natural language query
- Agent returns file:line-range spans via the `finish` tool call at the end
- Pricing: $0.80 / 1M input + $0.80 / 1M output tokens
- Searching in an isolated context window is the core value: the main agent context stays clean

Acceptance criteria:

- `warp_grep` is registered as a Pi-native model-facing tool
- the tool accepts `searchTerm` (required) and optionally `repoRoot` (defaults to CWD)
- the implementation runs the full multi-turn agent loop locally: send initial message with `<repo_structure>` + `<search_string>`, execute each tool call (grep_search → rg, read → fs, list_directory → find/ls, glob → rg --files), inject turn counter, repeat until `finish` or max 6 turns
- `finish` call result is parsed and the relevant file:line spans are read and surfaced to the model as tool output
- streaming step output is shown in Pi TUI during the search (turn number, tool calls being executed)
- tool metadata teaches the model the official routing policy:
  - use `warp_grep` at the beginning of codebase explorations, for broad semantic queries: "Find the XYZ flow", "How does XYZ work", "Where is XYZ handled?", "Where is <error message> coming from?"
  - do NOT use `warp_grep` to pin-point exact keywords or regex patterns — use native `grep` for that
  - `warp_grep` adds ~6 seconds of latency; skip it when a direct grep would suffice
- GitHub public repo search mode is deferred to a follow-up item
- docs clearly distinguish `warp_grep` from native `grep`/`find`
- the AGENTS.md in this repo and the package README teach the same routing guidance so operators can copy it into their own project AGENTS.md

## PIM-007: Compact lifecycle-hook integration

Status: pending. Blocked on PIM-006 completion to establish WarpGrep patterns.

Integrate Morph Compact into Pi's context-compaction lifecycle as a `PreCompact` hook rather than a normal model-facing tool.

Background from official docs:

- Model: `morph-compactor` via `POST /v1/compact` or OpenAI-compat `POST /v1/chat/completions`
- 33,000 tok/s; 50-70% token reduction; every surviving line byte-for-byte identical to input (no summarization, no paraphrasing)
- Key parameters: `input` (string or message array), `query` (what matters for the next call), `compression_ratio` (default 0.5; try 0.3 for 100+ turn loops), `preserve_recent` (min 3 recommended)
- `<keepContext>` / `</keepContext>` tags force-preserve wrapped sections regardless of compression ratio
- Response includes `compacted_line_ranges` (lines removed) and `kept_line_ranges` (force-preserved)
- Compact before the LLM call — the value is reducing what is sent, not post-processing responses
- Official guidance for agent integrations: read existing compaction logic first, choose right client (TypeScript SDK `@morphllm/morphsdk`, OpenAI-compat, or raw HTTP), always pass `query`, set `preserve_recent: 3`

Acceptance criteria:

- Compact is wired to Pi's `PreCompact` lifecycle hook, not registered as a `registerTool()` call
- the hook reads the current session messages, calls `POST /v1/compact` with `query` set to the last user message's text
- `compression_ratio` and `preserve_recent` are configurable via env vars with documented defaults (`MORPH_COMPACT_RATIO`, `MORPH_COMPACT_PRESERVE_RECENT`)
- `<keepContext>` tag injection is documented so operators can force-preserve critical sections
- the hook reports operator-visible output: token reduction, compression ratio achieved, lines removed
- system messages are not compressed by default (`compress_system_messages: false`)
- the package documents exactly when Compact runs (Pi `PreCompact` event), what it preserves, and why it is not a normal tool
- fallback: if `MORPH_API_KEY` is not set, the hook skips silently and Pi's default compaction runs instead

## PIM-008: WarpGrep routing guidance in AGENTS.md and promptGuidelines

Status: pending. Can be done alongside or shortly after PIM-006.

The official Morph docs (and all major integrations: Claude Code, Cursor, Codex) add routing guidance to the agent's memory so the LLM knows when to call WarpGrep vs native tools. Pi-morph should ship this guidance in a form operators can adopt without manual copy-paste.

Acceptance criteria:

- `warp_grep` tool metadata includes `promptSnippet` and `promptGuidelines` matching Morph's official routing policy (see PIM-006 criteria)
- the package README includes a ready-to-paste AGENTS.md block that operators can drop into their own projects:
  ```
  Fast Apply: Use fast_apply for scattered or fragile edits in existing files; use edit for small exact replacements and write for new files.
  Warp Grep: warp_grep is a subagent. Use it at the start of codebase explorations for broad semantic queries — "Find the XYZ flow", "How does XYZ work", "Where is XYZ handled?". Do not use it for exact keyword searches; use native grep instead.
  ```
- the repo's own AGENTS.md is updated to carry this guidance once warp_grep ships
- the guidance is verified: a test session confirms the model reaches for `warp_grep` on broad queries and `grep`/`find` on exact patterns
