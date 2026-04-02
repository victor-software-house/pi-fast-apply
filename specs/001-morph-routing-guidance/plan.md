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
**Constraints**: Pi-native first, existing-file-only `morph_edit`, concise decision-oriented metadata, first-person instruction rule, marker-based partial-edit rule, consistent fallback guidance to `edit`/`write`, model-facing metadata ceiling of 1400 chars (~350 tokens) per research Decision 6  
**Scale/Scope**: One extension entrypoint (`extensions/index.ts`), root package docs (`README.md`, `ROADMAP.md`), repo agent guidance (`AGENTS.md`), and feature docs for a single tool contract refinement  
**Verification**: Pi RPC client live model tests across 4 models (claude-opus-4-6, claude-sonnet-4-6, gpt-5.4, gpt-5.3-codex) for tool-choice verification (SC-005), plus pi-test-harness playbook tests for deterministic contract enforcement, per research Decision 7

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Pi-Native First**: Pass. The plan changes only Pi-native tool metadata and package documentation; it does not shift behavior to MCP.
- **II. Morph as Semantic Engine**: Pass. The plan does not alter file I/O ownership or validation boundaries; it only clarifies when and how to invoke the semantic merge path.
- **III. Minimal Tool Surface**: Pass. The intended change is to improve decision-oriented wording without adding parameters or expanding the tool schema. Conciseness will be validated by measuring token overhead of the final metadata.
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

**Structure Decision**: Use the existing single-package layout. Implementation changes are expected in `extensions/index.ts`, root docs (`README.md`, `ROADMAP.md`), and repo agent guidance (`AGENTS.md`), with feature planning artifacts stored under `specs/001-morph-routing-guidance/`.

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
- **III. Minimal Tool Surface**: Pass. The contract emphasizes concise routing text, explicitly avoids parameter growth, and adds token-count and programmatic scenario verification to confirm the guidance stays effective.
- **IV. Operator Safety**: Pass. The design sharpens routing away from unsafe use cases such as new-file creation.
- **V. Incremental Delivery**: Pass. The design remains a narrow documentation-and-contract refinement over an existing working tool.

## Token Ceiling (SC-003)

The token ceiling for `morph_edit` model-facing metadata is **1400 characters** (~350 tokens), defined by research Decision 6. This is measured as:

```
description.length + promptSnippet.length + sum(promptGuidelines[].length) + sum(parameterDescriptions[].length)
```

Current measurement: **883 chars** (~221 tokens). PIM-004 proposed wording: **1201 chars** (~301 tokens, 86% of ceiling). Pi built-in `edit` tool: **1385 chars** (~347 tokens). Ceiling provides ~200 chars headroom.

## Programmatic Testing Strategy (SC-005)

Two complementary test suites, both in scope for this feature:

**RPC live model tests** (satisfies SC-005): Use `RpcClient` to spawn Pi headless with pi-morph loaded, send routing scenario prompts, observe `tool_execution_start.toolName` in the `AgentEvent` stream, and assert expected tool choice. Run across four models:
- claude-opus-4-6 (Anthropic)
- claude-sonnet-4-6 (Anthropic)
- gpt-5.4 (OpenAI)
- gpt-5.3-codex (OpenAI)

Five scenarios per model: scattered edit, fragile edit, small exact replacement, new file, full-file replacement. Run via `bun run test:routing` (not gated CI). Mock tool execution to avoid real file mutations.

**Playbook contract tests** (complements SC-005, satisfies FR-007/FR-010): Use `@marcfargas/pi-test-harness` with scripted playbooks to verify tool contract enforcement — morph_edit succeeds for valid cases, rejects new-file creation, requires markers. Deterministic, cost-free, CI-safe.

See research Decision 7 for full rationale.

## Complexity Tracking

No constitution violations identified; no complexity exceptions required.