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

Status: completed.

Validate the edit flow against a real Morph environment.

Acceptance criteria:

- `morph_edit` is exercised with a real `MORPH_API_KEY`
- a dry run and a real write both succeed on a temporary file
- the verified behavior is documented in the repo
- any limitations discovered during validation are turned into explicit follow-up items

## PIM-004: Morph edit Pi-native UX and SDK surface

Status: immediate next priority.

Bring `morph_edit` closer to Pi-native tool quality by using Pi's built-in tool rendering and streaming primitives more fully, and by exposing the most important remaining Morph SDK controls.

Acceptance criteria:

- `morph_edit` defines a custom `renderCall()` so the operator sees a concise Pi-native summary of the target path and dry-run state
- `morph_edit` defines a custom `renderResult()` with a compact collapsed summary and an expanded diff-oriented view
- the expanded result view uses Pi's built-in diff rendering utilities instead of plain text-only output when `udiff` is available
- partial progress updates are surfaced through `onUpdate()` and rendered clearly while the tool is still running
- the tool's `content` / `details` / `renderResult()` split is deliberate and preserves useful model-facing data without forcing raw transport-shaped output on the operator
- the package exposes the most important remaining Fast Apply SDK controls, at minimum the large/fast apply mode choice and retry configuration
- any lower-priority SDK options kept internal or deferred are documented explicitly so the public surface stays intentional rather than accidental

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
