# ROADMAP

This roadmap defines the first implementation slices for `pi-morph`.

## PIM-001: Package scaffold and release baseline

Status: completed.

Establish the package metadata, extension entrypoint, lint gates, hooks, and release flow.

Acceptance criteria:

- root package metadata matches the intended `pi-morph` package identity
- `pi.extensions` points at `./extensions`
- lint, typecheck, hook, and release files are present and working
- `assets/` exists for pi.dev preview imagery
- the repo can install dependencies and pass `bun run typecheck` and `bun run lint`

## PIM-002: Pi-native Morph edit tool

Status: completed.

Implement a native Pi extension surface for Fast Apply editing.

Acceptance criteria:

- `extensions/index.ts` registers a native `morph_edit` tool
- the tool keeps path resolution and file mutation queueing inside Pi
- the implementation uses the official Morph SDK directly rather than treating MCP as the primary native path
- dry-run behavior is supported
- failures produce actionable operator-visible messages

## PIM-003: Manual validation against real Morph credentials

Status: completed — re-verified 2026-04-03 with fixture corpus.

Validate the edit flow against a real Morph environment.

Acceptance criteria:

- `morph_edit` is exercised with a real `MORPH_API_KEY`
- a dry run and a real write both succeed on a temporary file
- the verified behavior is documented in the repo
- any limitations discovered during validation are turned into explicit follow-up items

Re-verification (2026-04-03): 12 scenarios passed against a 10-file fixture corpus.
Two bugs found and fixed (BUG-001, BUG-002). Full report:
[`test/reports/2026-04-03-manual-validation.md`](test/reports/2026-04-03-manual-validation.md)

## PIM-004: Morph edit prompt contract and context-efficient tool metadata

Status: immediate next priority.

Refine `morph_edit` so its `registerTool()` metadata is context-efficient, Pi-native, and aligned with Morph's own guidance for high-quality partial-edit prompting.

Acceptance criteria:

- `morph_edit` keeps a small, disciplined model-facing schema and does not grow a kitchen-sink parameter surface without strong evidence
- the tool `description` is short and decision-oriented, explaining when to use `morph_edit` and how it differs from native `edit` and `write`
- the tool `promptSnippet` stays a single concise line suitable for Pi's `Available tools` section
- the tool `promptGuidelines` stay intentionally short and encode the most important Morph-native editing rules rather than restating a long manual
- the tool metadata explicitly teaches the model to use first-person `instruction` text
- the tool metadata explicitly teaches the model to provide only changed regions plus `// ... existing code ...` markers in `codeEdit`
- the tool metadata and docs teach partial semantic editing rather than exact-string replacement thinking
- the package docs and examples reinforce the same routing guidance used by the tool metadata so the operator-visible contract stays consistent
- the package preserves the separate `morph_edit` tool shape instead of overriding native `edit`, and it includes clear fallback guidance back to native tools when Morph is not the right choice or is unavailable
- the final prompt/tool-contract wording is checked against official Morph guidance and the `opencode-morph-plugin` routing policy so the Pi package follows the same core decision model without copying unnecessary verbosity

Suggested starting point for the tool prompt contract, adapted from Morph's own Fast Apply guidance and the `morphllm/opencode-morph-plugin` routing policy:

- `description`: "Edit an existing file using partial code snippets with '// ... existing code ...' markers. Use morph_edit for multiple scattered changes in one existing file, complex refactors, or edits where exact oldText matching would be fragile. Use edit for small exact replacements and write for new files."
- `promptSnippet`: "Use morph_edit for scattered or fragile edits in existing files; use edit for small exact replacements and write for new files."
- `promptGuidelines`:
  1. "Write instruction in first person and make it specific, for example: 'I am adding input validation to the add function.'"
  2. "In codeEdit, include only the changed sections and wrap unchanged sections with '// ... existing code ...' markers instead of rewriting the whole file."
  3. "Include enough unique surrounding context to anchor each change precisely, preserve exact indentation, and use edit instead when the change is just a small exact replacement."

## PIM-005: Morph auth configuration in Pi

Status: after PIM-004.

Add a first-class Pi-native auth path for Morph that fits Pi's existing credential storage model while preserving the current environment-variable workflow.

Acceptance criteria:

- the package provides an operator flow to configure Morph credentials directly from Pi instead of requiring external environment setup only
- credentials can be stored through Pi's existing auth storage path (`auth.json` via `ctx.modelRegistry.authStorage`) rather than inventing a parallel package-local store
- the package keeps the existing environment-based workflow working so fnox-injected `MORPH_API_KEY` remains a valid path
- key resolution priority and fallback behavior are documented and verified
- the package provides a way to remove stored Morph credentials cleanly
- the implementation documents why it follows Pi's auth storage conventions, and if a stronger-at-rest option such as age/keychain/fnox remains preferable, that trade-off is stated explicitly

## PIM-006: WarpGrep native search family

Status: next major slice after Morph edit UX/auth.

Add Morph search capabilities as Pi-native tools.

Acceptance criteria:

- local codebase search is exposed through a Pi-native tool
- public GitHub search is exposed through a Pi-native tool
- streaming/progress behavior is surfaced in a Pi-appropriate way
- docs clearly distinguish when to use WarpGrep versus native `grep`/`find`

## PIM-007: Compact integration design

Status: pending.

Decide how Morph Compact should integrate with Pi.

Acceptance criteria:

- the package documents the lifecycle-hook strategy for Compact
- Compact is not shipped as a normal editing tool by default
- the implementation plan explains how Pi context ownership and Morph compression should split responsibilities
