# Implementation Plan: Improve morph_edit Routing Guidance

**Branch**: `001-morph-routing-guidance` | **Date**: 2026-04-02 | **Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `/specs/001-morph-routing-guidance/spec.md`

**Note**: This plan covers Phase 0 research and Phase 1 design artifacts for refining `morph_edit` routing guidance so Pi models choose the right editing tool and form valid Morph requests.

## Summary

Refine the `morph_edit` tool contract and supporting package documentation so the model consistently routes scattered or fragile edits to `morph_edit`, uses first-person instructions with marker-based partial edits, and falls back to `edit` or `write` for exact replacements and new/full-file work. The change should preserve Pi-native ownership, keep the metadata concise, and align repo documentation with the same routing rules.

## Technical Context

**Language/Version**: TypeScript (strict), targeting ES2023 via Bun ESM tooling  
**Primary Dependencies**: `@mariozechner/pi-coding-agent`, `@morphllm/morphsdk`, `@sinclair/typebox`  
**Storage**: Files in the repo; no database storage  
**Testing**: `bun run typecheck`, `bun run lint`, plus focused contract review of tool metadata and docs  
**Target Platform**: Pi extension package running in Bun on operator machines  
**Project Type**: Pi extension/library package  
**Performance Goals**: Routing rules remain readable in under 30 seconds and small enough to avoid unnecessary model-context bloat  
**Constraints**: Pi-native first, existing-file-only `morph_edit`, concise decision-oriented metadata, first-person instruction rule, marker-based partial-edit rule, consistent fallback guidance to `edit`/`write`  
**Scale/Scope**: One extension entrypoint (`extensions/index.ts`), root package docs, and feature docs for a single tool contract refinement

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Pi-Native First**: Pass. The plan changes only Pi-native tool metadata and package documentation; it does not shift behavior to MCP.
- **II. Morph as Semantic Engine**: Pass. The plan does not alter file I/O ownership or validation boundaries; it only clarifies when and how to invoke the semantic merge path.
- **III. Minimal Tool Surface**: Pass. The intended change is to improve decision-oriented wording without adding parameters or expanding the tool schema.
- **IV. Operator Safety**: Pass. The routing guidance will more clearly steer new files and full rewrites away from `morph_edit`, reinforcing existing safety boundaries.
- **V. Incremental Delivery**: Pass. This is a small, documented refinement to the current tool contract and supporting docs.

## Project Structure

### Documentation (this feature)

```text
specs/001-morph-routing-guidance/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── morph-edit-routing-guidance.md
└── tasks.md
```

### Source Code (repository root)

```text
.
├── README.md
├── ROADMAP.md
├── AGENTS.md
├── assets/
│   └── README.md
├── extensions/
│   └── index.ts
├── specs/
│   └── 001-morph-routing-guidance/
└── .specify/
    ├── memory/
    ├── scripts/
    └── templates/
```

**Structure Decision**: Use the existing single-package layout. Implementation changes are expected in `extensions/index.ts` and root docs such as `README.md` and `ROADMAP.md`, with feature planning artifacts stored under `specs/001-morph-routing-guidance/`.

## Phase 0: Research Plan

1. Confirm the current repo-grounded routing problem by comparing `extensions/index.ts`, `README.md`, and `ROADMAP.md`.
2. Decide the minimum routing language that distinguishes `morph_edit` from `edit` and `write` without bloating metadata.
3. Decide how first-person instruction and marker-based partial-edit rules should be expressed consistently across tool metadata and package docs.
4. Capture rationale and rejected alternatives in `research.md`.

## Phase 1: Design Plan

1. Model the user-facing guidance concepts in `data-model.md`.
2. Define the public contract for routing and instruction style in `contracts/morph-edit-routing-guidance.md`.
3. Write a `quickstart.md` that shows maintainers how to validate the final guidance with representative routing examples.
4. Update agent context via `.specify/scripts/bash/update-agent-context.sh pi`.
5. Re-check constitution compliance after design artifacts are complete.

## Post-Design Constitution Check

- **I. Pi-Native First**: Pass. Design artifacts keep the change scoped to Pi-native extension metadata and repo docs.
- **II. Morph as Semantic Engine**: Pass. The design leaves file reads, writes, queueing, and validation in Pi.
- **III. Minimal Tool Surface**: Pass. The contract emphasizes concise routing text and explicitly avoids parameter growth.
- **IV. Operator Safety**: Pass. The design sharpens routing away from unsafe use cases such as new-file creation.
- **V. Incremental Delivery**: Pass. The design remains a narrow documentation-and-contract refinement over an existing working tool.

## Complexity Tracking

No constitution violations identified; no complexity exceptions required.