# ROADMAP

This roadmap defines the first implementation slices for `pi-morph`.

## PIM-001: Package scaffold and release baseline

Establish the package metadata, extension entrypoint, lint gates, hooks, and release flow.

Acceptance criteria:

- root package metadata matches the intended `pi-morph` package identity
- `pi.extensions` points at `./extensions`
- lint, typecheck, hook, and release files are present and working
- `assets/` exists for pi.dev preview imagery
- the repo can install dependencies and pass `bun run typecheck` and `bun run lint`

## PIM-002: Pi-native Morph edit tool

Implement a native Pi extension surface for Fast Apply editing.

Acceptance criteria:

- `extensions/index.ts` registers a native `morph_edit` tool
- the tool keeps path resolution and file mutation queueing inside Pi
- the implementation uses the official Morph SDK directly rather than treating MCP as the primary native path
- dry-run behavior is supported
- failures produce actionable operator-visible messages

## PIM-003: Manual validation against real Morph credentials

Validate the edit flow against a real Morph environment.

Acceptance criteria:

- `morph_edit` is exercised with a real `MORPH_API_KEY`
- a dry run and a real write both succeed on a temporary file
- the verified behavior is documented in the repo
- any limitations discovered during validation are turned into explicit follow-up items

## PIM-004: WarpGrep native search family

Add Morph search capabilities as Pi-native tools.

Acceptance criteria:

- local codebase search is exposed through a Pi-native tool
- public GitHub search is exposed through a Pi-native tool
- streaming/progress behavior is surfaced in a Pi-appropriate way
- docs clearly distinguish when to use WarpGrep versus native `grep`/`find`

## PIM-005: Compact integration design

Decide how Morph Compact should integrate with Pi.

Acceptance criteria:

- the package documents the lifecycle-hook strategy for Compact
- Compact is not shipped as a normal editing tool by default
- the implementation plan explains how Pi context ownership and Morph compression should split responsibilities
