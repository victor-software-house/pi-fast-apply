# Data Model: Improve morph_edit Routing Guidance

## Overview

This feature does not introduce persisted application data. Its design model consists of user-facing guidance entities that define how the model chooses among editing tools and how a valid `morph_edit` request is shaped.

## Entities

### 1. Routing Guidance

**Purpose**: Encodes the decision boundary between `morph_edit`, `edit`, and `write`.

**Fields**:
- **target file state**: whether the request applies to an existing file or a new file
- **change shape**: single exact replacement, scattered multi-region change, fragile match, or full-file replacement
- **selected tool**: `morph_edit`, `edit`, or `write`
- **justification**: the short reason the selected tool is the correct fit

**Validation rules**:
- Must route new-file creation to `write`
- Must route full-file replacement to `write`
- Must route small exact replacements in existing files to `edit`
- Must route scattered or fragile edits in one existing file to `morph_edit`
- Must remain concise and decision-oriented

**Relationships**:
- Produces one **Fallback Rule** when `morph_edit` is not the preferred tool
- Governs when an **Instruction Pattern** is required

### 2. Instruction Pattern

**Purpose**: Defines the expected wording style for the `instruction` field when `morph_edit` is selected.

**Fields**:
- **voice**: first person
- **specificity**: clear statement of the intended change
- **example**: one representative first-person sentence

**Validation rules**:
- Must be first person
- Must describe the intended change directly
- Must avoid vague phrases that do not tell Morph what is changing

**Relationships**:
- Applies only when **Routing Guidance** selects `morph_edit`
- Works alongside **Code Edit Pattern** to form a complete Morph request

### 3. Code Edit Pattern

**Purpose**: Defines the expected structure of the `codeEdit` field for Morph partial edits.

**Fields**:
- **changed regions only**: include only the portions being changed
- **omission marker**: `// ... existing code ...`
- **anchor context**: unique surrounding lines that identify each edit region
- **format preservation**: indentation and surrounding structure stay consistent

**Validation rules**:
- Must use unchanged-code markers when unchanged sections are omitted from a non-trivial edit
- Must preserve indentation and surrounding structure
- Must include enough nearby context to anchor each changed region uniquely
- Must not present whole-file replacement as the normal `morph_edit` path

**Relationships**:
- Paired with **Instruction Pattern** whenever `morph_edit` is used
- Constrained by **Routing Guidance** because partial-edit structure is only valid for the `morph_edit` path

### 4. Fallback Rule

**Purpose**: Captures when the workflow should use a native Pi editing tool instead of `morph_edit`.

**Fields**:
- **disqualifying condition**: new file, full-file replacement, or small exact stable replacement
- **fallback tool**: `edit` or `write`
- **reason**: why the native tool is more appropriate

**Validation rules**:
- Must distinguish between exact replacement and full-file writing
- Must be consistent with routing guidance in all operator-visible locations
- Must not imply that `morph_edit` is preferred for every existing-file change

**Relationships**:
- Derived from **Routing Guidance**
- Prevents misuse of **Instruction Pattern** and **Code Edit Pattern** in non-Morph flows

## State Transitions

### Tool Selection Flow

1. **Request received** → classify file state and change shape
2. **Routing evaluated** → choose `morph_edit`, `edit`, or `write`
3. If `morph_edit` selected → apply **Instruction Pattern** and **Code Edit Pattern**
4. If `edit` or `write` selected → apply the corresponding native Pi workflow and do not require Morph-specific guidance

## Acceptance Mapping

- **FR-001, FR-002, FR-003, FR-004, FR-010** map to **Routing Guidance** and **Fallback Rule**
- **FR-005** maps to **Instruction Pattern**
- **FR-006** maps to **Code Edit Pattern**
- **FR-007, FR-008, FR-009** constrain all entities as cross-cutting consistency rules