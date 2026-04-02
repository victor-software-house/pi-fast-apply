# Tasks: Improve morph_edit Routing Guidance

**Input**: Design documents from `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/`
**Prerequisites**: `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/plan.md`, `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/spec.md`, `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/research.md`, `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/data-model.md`, `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/contracts/morph-edit-routing-guidance.md`

**Tests**: No story-specific TDD tests were requested in the specification. Verification tasks focus on repository gates and quickstart-guided contract review.

**Organization**: Tasks are grouped by user story to enable independent implementation and validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Every task includes an exact file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the implementation surface and validation path before editing runtime guidance

- [ ] T001 Review the current morph guidance touchpoints in `/Users/victor/workspace/victor/pi-morph/extensions/index.ts`, `/Users/victor/workspace/victor/pi-morph/README.md`, and `/Users/victor/workspace/victor/pi-morph/ROADMAP.md` against `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/contracts/morph-edit-routing-guidance.md`
- [ ] T002 Confirm the final review scenarios and exit criteria in `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/quickstart.md` for scattered edits, fragile edits, exact replacements, new files, and full-file replacements

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish one canonical routing policy that all implementation tasks will follow

**⚠️ CRITICAL**: No user story implementation should start until this phase is complete

- [ ] T003 Define the canonical routing language to be reused during implementation from `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/research.md` and `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/contracts/morph-edit-routing-guidance.md`
- [ ] T004 Capture the implementation scope and files to update in `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/plan.md` and keep the change limited to `/Users/victor/workspace/victor/pi-morph/extensions/index.ts`, `/Users/victor/workspace/victor/pi-morph/README.md`, and `/Users/victor/workspace/victor/pi-morph/ROADMAP.md`

**Checkpoint**: Canonical routing policy agreed; user story work can begin

---

## Phase 3: User Story 1 - Route the right edit tool (Priority: P1) 🎯 MVP

**Goal**: Make the model reliably choose `morph_edit` for scattered or fragile edits and keep `edit` for small exact replacements

**Independent Test**: Review the runtime metadata and package docs with the quickstart scenarios and confirm that scattered existing-file edits and fragile existing-file edits unambiguously route to `morph_edit`, while small exact replacements route to `edit`

### Implementation for User Story 1

- [ ] T005 [US1] Refine the `morph_edit` tool `description`, `promptSnippet`, and `promptGuidelines` in `/Users/victor/workspace/victor/pi-morph/extensions/index.ts` so scattered edits and fragile exact-match cases clearly route to `morph_edit`
- [ ] T006 [US1] Update the tool contract wording in `/Users/victor/workspace/victor/pi-morph/README.md` so the package documentation matches the runtime routing rule for scattered edits, fragile edits, and small exact replacements
- [ ] T007 [US1] Update `/Users/victor/workspace/victor/pi-morph/ROADMAP.md` so the PIM-004 acceptance criteria and suggested wording stay aligned with the final routing policy

**Checkpoint**: User Story 1 is independently reviewable through the scattered/fragile/exact-replacement routing scenarios

---

## Phase 4: User Story 2 - Produce Morph-ready instructions (Priority: P2)

**Goal**: Ensure `morph_edit` guidance consistently teaches first-person instructions and marker-based partial edits

**Independent Test**: Review the final `morph_edit` guidance and confirm every instruction example is first person, specific, and paired with changed-region guidance using `// ... existing code ...` markers and adequate local context

### Implementation for User Story 2

- [ ] T008 [US2] Strengthen the `instruction` and `codeEdit` guidance in `/Users/victor/workspace/victor/pi-morph/extensions/index.ts` so first-person wording, changed-regions-only edits, marker usage, and anchor context are explicit and concise
- [ ] T009 [US2] Mirror the first-person instruction rule and partial-edit marker guidance in `/Users/victor/workspace/victor/pi-morph/README.md` so operator-facing documentation reinforces the same Morph-ready request shape

**Checkpoint**: User Story 2 is independently reviewable through instruction-style and partial-edit-format scenarios

---

## Phase 5: User Story 3 - Fall back to native tools appropriately (Priority: P3)

**Goal**: Make fallback boundaries to `edit` and `write` explicit for simple exact replacements, new files, and full-file rewrites

**Independent Test**: Review the final runtime metadata and docs with the quickstart scenarios and confirm new-file creation and full-file replacement route to `write`, while small exact replacements route to `edit`

### Implementation for User Story 3

- [ ] T010 [US3] Clarify fallback boundaries in `/Users/victor/workspace/victor/pi-morph/extensions/index.ts` so `morph_edit` is explicitly limited to existing-file partial semantic edits and redirects new-file and full-file work to `write`
- [ ] T011 [P] [US3] Update fallback guidance in `/Users/victor/workspace/victor/pi-morph/README.md` so it clearly distinguishes `morph_edit`, `edit`, and `write` for partial semantic edits, exact replacements, and full-file work
- [ ] T012 [P] [US3] Align the fallback examples and acceptance wording in `/Users/victor/workspace/victor/pi-morph/ROADMAP.md` with the final `edit`/`write` boundaries

**Checkpoint**: User Story 3 is independently reviewable through new-file, full-rewrite, and exact-replacement fallback scenarios

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate consistency, quality gates, and final review artifacts across all user stories

- [ ] T013 Run the quickstart validation checklist in `/Users/victor/workspace/victor/pi-morph/specs/001-morph-routing-guidance/quickstart.md` against `/Users/victor/workspace/victor/pi-morph/extensions/index.ts`, `/Users/victor/workspace/victor/pi-morph/README.md`, `/Users/victor/workspace/victor/pi-morph/ROADMAP.md`, and `/Users/victor/workspace/victor/pi-morph/AGENTS.md`
- [ ] T014 Run repository verification with `bun run typecheck` and `bun run lint` from `/Users/victor/workspace/victor/pi-morph`
- [ ] T015 Update `/Users/victor/workspace/victor/pi-morph/AGENTS.md` so repo agent guidance is consistent with the final routing contract in `/Users/victor/workspace/victor/pi-morph/extensions/index.ts` and `/Users/victor/workspace/victor/pi-morph/README.md`
- [ ] T016 Compute the character count of the final `morph_edit` tool description, prompt snippet, prompt guidelines, and parameter descriptions in `/Users/victor/workspace/victor/pi-morph/extensions/index.ts` and verify the total stays at or below the 1400-character ceiling defined in research Decision 6
- [ ] T017 Implement RPC-based live model routing tests in `/Users/victor/workspace/victor/pi-morph/test/routing-live.test.ts` that verify tool-choice across four models (claude-opus-4-6, claude-sonnet-4-6, gpt-5.4, gpt-5.3-codex) using `RpcClient.promptAndWait()` and asserting `tool_execution_start.toolName` for five scenarios (scattered, fragile, exact-replacement, new-file, full-rewrite) per SC-005 and research Decision 7
- [ ] T018 Implement pi-test-harness playbook contract tests in `/Users/victor/workspace/victor/pi-morph/test/routing-contract.test.ts` that verify: (a) `morph_edit` succeeds for scattered/fragile edits with markers, (b) `morph_edit` rejects new-file creation, (c) `morph_edit` requires markers for non-trivial files, using `createTestSession` with mock tools and playbook-driven tool calls per research Decision 7

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion; blocks all user story implementation
- **User Story 1 (Phase 3)**: Depends on Foundational completion; establishes the MVP routing behavior
- **User Story 2 (Phase 4)**: Depends on User Story 1 because it refines the same runtime and documentation contract with instruction-shape guidance
- **User Story 3 (Phase 5)**: Depends on User Story 1 because fallback wording must align with the final routing policy already established for `morph_edit`
- **Polish (Phase 6)**: Depends on completion of the desired user stories

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories after Foundational phase
- **US2 (P2)**: Depends on US1 wording being in place, but remains independently testable through instruction-style review
- **US3 (P3)**: Depends on US1 wording being in place, but remains independently testable through fallback review

### Within Each User Story

- Update runtime guidance before documentation for the same rule set
- Keep README and ROADMAP aligned with the final runtime wording before moving to the next story
- Complete story-specific review before moving to polish

### Parallel Opportunities

- T011 and T012 can run in parallel after T010 because they touch different files
- T015, T016, T017, and T018 can run in parallel after all user story phases are complete

---

## Parallel Example: User Story 3

```bash
# After T010 clarifies runtime fallback boundaries, these can run together:
Task: "Update fallback guidance in /Users/victor/workspace/victor/pi-morph/README.md"
Task: "Align the fallback examples and acceptance wording in /Users/victor/workspace/victor/pi-morph/ROADMAP.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the US1 independent test from the quickstart scenarios
5. If routing is clear for scattered, fragile, and exact-replacement cases, the MVP is ready

### Incremental Delivery

1. Establish canonical routing policy
2. Deliver US1 to lock in correct tool choice
3. Deliver US2 to improve Morph request quality
4. Deliver US3 to sharpen fallback boundaries
5. Run cross-cutting validation and repository gates

### Parallel Team Strategy

With multiple contributors:

1. One contributor completes Setup + Foundational phases
2. Contributor A implements runtime guidance in `/Users/victor/workspace/victor/pi-morph/extensions/index.ts`
3. Contributor B mirrors approved wording into `/Users/victor/workspace/victor/pi-morph/README.md`
4. Contributor C aligns roadmap-facing acceptance language in `/Users/victor/workspace/victor/pi-morph/ROADMAP.md`
5. Finish with shared validation, token measurement, programmatic scenario testing, and repo gates

---

## Notes

- All tasks follow the required checklist format: checkbox, task ID, optional `[P]`, required story label for story phases, and exact file paths
- No test files were added because the specification did not request TDD or automated test creation for this documentation-and-metadata refinement
- Suggested MVP scope: **User Story 1 only**
- Commit after each completed task or tightly related task group