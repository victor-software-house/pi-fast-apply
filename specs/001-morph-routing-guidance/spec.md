# Feature Specification: Improve morph_edit Routing Guidance

**Feature Branch**: `001-morph-routing-guidance`
**Created**: 2026-04-02
**Status**: Draft
**Input**: User description: "improve morph_edit routing guidance so the model reliably chooses morph_edit for scattered or fragile edits, uses first-person instructions, and falls back to edit/write appropriately"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Route the right edit tool (Priority: P1)

As a Pi operator, I want the model to choose `morph_edit` when a change spans multiple scattered regions or when exact matching is likely to be brittle, so that editing succeeds without repeated failed replacements or unnecessary full-file rewrites.

**Why this priority**: Correct tool routing is the core user outcome. If the model keeps choosing the wrong editing tool, the package does not deliver its intended value.

**Independent Test**: Can be fully tested by presenting editing tasks that involve several disjoint changes or fragile matching conditions and confirming the model chooses `morph_edit` instead of `edit` or `write`.

**Acceptance Scenarios**:

1. **Given** an existing file that needs changes in several separated locations, **When** the model decides which editing tool to use, **Then** it selects `morph_edit`.
2. **Given** an existing file where exact text replacement is likely to fail because the target text is fragile or whitespace-sensitive, **When** the model decides which editing tool to use, **Then** it selects `morph_edit`.
3. **Given** a small edit with one exact, stable replacement in an existing file, **When** the model decides which editing tool to use, **Then** it selects `edit` instead of `morph_edit`.

---

### User Story 2 - Produce Morph-ready instructions (Priority: P2)

As a Pi operator, I want the model to produce `morph_edit` requests in the expected style, so that Morph receives usable instructions without additional correction from me.

**Why this priority**: Correct routing alone is insufficient if the resulting `morph_edit` call is malformed or low quality.

**Independent Test**: Can be fully tested by asking the model to prepare a `morph_edit` call and verifying that the instruction is first-person, specific, and paired with a partial edit that uses unchanged-code markers appropriately.

**Acceptance Scenarios**:

1. **Given** the model has chosen `morph_edit`, **When** it fills the instruction field, **Then** the instruction is written in first person and clearly states the intended change.
2. **Given** the model has chosen `morph_edit`, **When** it fills the code edit field, **Then** it provides only the changed regions with unchanged-code markers rather than rewriting the full file unnecessarily.
3. **Given** a partial edit needs multiple anchors, **When** the model prepares the code edit field, **Then** it includes enough surrounding context to distinguish each changed region clearly.

---

### User Story 3 - Fall back to native tools appropriately (Priority: P3)

As a Pi operator, I want the model to fall back to `edit` or `write` when `morph_edit` is not the right fit, so that the editing workflow stays efficient and predictable.

**Why this priority**: Good routing includes knowing when not to use Morph. This protects simple edits from unnecessary complexity and keeps new-file creation on the correct path.

**Independent Test**: Can be fully tested by providing tasks for small exact replacements, full-file replacement, and new-file creation, then confirming the model chooses the appropriate native tool.

**Acceptance Scenarios**:

1. **Given** a new file must be created, **When** the model decides which editing tool to use, **Then** it selects `write` rather than `morph_edit`.
2. **Given** an existing file needs a complete replacement rather than a partial semantic edit, **When** the model decides which editing tool to use, **Then** it selects `write` rather than `morph_edit`.
3. **Given** an existing file needs a small exact replacement with stable matching text, **When** the model decides which editing tool to use, **Then** it selects `edit` rather than `morph_edit`.

### Edge Cases

- A request combines one simple exact replacement with one fragile or scattered change in the same existing file.
- A file is short, but exact old-text matching is still likely to be unreliable because formatting or nearby content may drift.
- A user asks for a full rewrite of an existing file after initially framing the task as a partial edit.
- The model must describe a `morph_edit` change without copying unchanged parts of a large file into the request.
- Existing package guidance appears in more than one place and must stay consistent so the model does not receive conflicting routing signals.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide routing guidance that clearly tells the model to choose `morph_edit` for scattered edits within one existing file.
- **FR-002**: The system MUST provide routing guidance that clearly tells the model to choose `morph_edit` when exact text matching would be fragile, even if the requested change is not large.
- **FR-003**: The system MUST provide routing guidance that clearly tells the model to choose `edit` for small exact replacements in existing files.
- **FR-004**: The system MUST provide routing guidance that clearly tells the model to choose `write` for new-file creation and full-file replacement.
- **FR-005**: The system MUST instruct the model that `morph_edit` instructions are written in first person and describe the intended change specifically.
- **FR-006**: The system MUST instruct the model that `morph_edit` code edits should contain only changed regions plus unchanged-code markers where surrounding content is omitted.
- **FR-007**: The system MUST explain that `morph_edit` is for existing files and must not be presented as the preferred path for creating new files.
- **FR-008**: The system MUST keep routing guidance concise enough that the combined token overhead of tool description, prompt snippet, and prompt guidelines stays within a defined ceiling, measured by computing token usage from the final metadata.
- **FR-009**: The system MUST keep operator-visible guidance consistent across the main tool description, supporting package documentation, and repo agent guidance so the same routing rules are reinforced in every operator-facing surface.
- **FR-011**: The system MUST be verifiable through programmatic scenario testing where Pi runs in detached or programmatic mode against representative routing scenarios across multiple models, and the observed tool choice matches the expected tool in each case.
- **FR-010**: The system MUST describe fallback behavior in a way that distinguishes partial semantic editing from exact replacement and full-file writing.

### Key Entities *(include if feature involves data)*

- **Routing Guidance**: The decision rules that tell the model when to choose `morph_edit`, `edit`, or `write`.
- **Instruction Pattern**: The expected wording style for `morph_edit` instructions, including first-person phrasing and change specificity.
- **Fallback Rule**: The boundary that redirects simple exact replacements or new-file/full-file work away from `morph_edit`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In representative routing examples for scattered, fragile, exact-replacement, and new-file tasks, the documented expected tool choice is unambiguous in 100% of cases.
- **SC-002**: In review of the final guidance, every `morph_edit` example instruction uses first-person phrasing and a specific change statement.
- **SC-003**: The combined token count of the `morph_edit` tool description, prompt snippet, and prompt guidelines does not exceed a defined ceiling, confirming that guidance stays context-efficient.
- **SC-004**: The package's operator-visible guidance contains no conflicting statements about when to use `morph_edit` versus native editing tools across tool metadata, package documentation, and repo agent guidance.
- **SC-005**: Programmatic scenario tests run in Pi detached or programmatic mode across representative routing scenarios and multiple models, and the model selects the expected tool in each case.

## Assumptions

- The audience for this feature is Pi operators and maintainers who rely on model-facing tool guidance to influence tool selection behavior.
- The current problem is guidance quality and consistency, not a need to expand the editing tool surface beyond `morph_edit`, `edit`, and `write`.
- Existing validation methods for reviewing tool descriptions and package documentation will continue to be used to confirm the routing guidance.
- This feature does not change the underlying capabilities of the editing tools; it only improves how their intended usage is communicated.