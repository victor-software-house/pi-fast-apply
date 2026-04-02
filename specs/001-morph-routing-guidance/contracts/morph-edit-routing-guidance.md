# Contract: morph_edit Routing Guidance

## Purpose

Define the user-visible contract for when `morph_edit` should be used, how a valid `morph_edit` request should be phrased, and when Pi's native `edit` or `write` tools should be used instead.

## Contract Scope

This contract applies to:
- `morph_edit` tool metadata exposed by the Pi extension
- package documentation that explains the tool contract to maintainers and operators
- review examples used to validate routing behavior

## Routing Rules

### Rule 1: Prefer morph_edit for scattered edits in one existing file

If a request changes several non-adjacent regions of the same existing file, the guidance must direct the model to choose `morph_edit`.

### Rule 2: Prefer morph_edit when exact replacement is fragile

If a request targets an existing file but exact text matching is likely to be brittle because of whitespace sensitivity, formatting drift, or weak anchoring, the guidance must direct the model to choose `morph_edit`.

### Rule 3: Prefer edit for small exact replacements

If a request is a small, stable, exact replacement in an existing file, the guidance must direct the model to choose `edit`.

### Rule 4: Prefer write for new files and full-file replacement

If a request creates a new file or replaces an entire file instead of applying a partial semantic edit, the guidance must direct the model to choose `write`.

## Instruction Contract

When `morph_edit` is selected:
- the `instruction` must be written in first person
- the `instruction` must state the intended change specifically
- the guidance should include one concise example of the expected pattern

### Accepted Pattern

- "I am adding input validation to the add function."

### Rejected Patterns

- "Add validation"
- "Need some edits here"
- third-person or passive descriptions that do not clearly state the intended change

## codeEdit Contract

When `morph_edit` is selected:
- include only changed regions rather than the whole file by default
- use `// ... existing code ...` markers when unchanged sections are omitted
- preserve indentation and surrounding structure
- include enough nearby context to anchor each change uniquely

## Consistency Requirements

The same routing policy must appear consistently across:
- runtime tool description
- runtime prompt snippet
- runtime prompt guidelines
- README tool contract or equivalent operator-facing documentation

## Review Scenarios

1. **Scattered existing-file change** → expected tool: `morph_edit`
2. **Fragile exact-match scenario** → expected tool: `morph_edit`
3. **Small stable exact replacement** → expected tool: `edit`
4. **New file creation** → expected tool: `write`
5. **Full-file replacement** → expected tool: `write`

## Out of Scope

- Adding new tool parameters
- Changing Morph SDK behavior
- Changing Pi file I/O, queueing, or validation logic
- Overriding Pi's native `edit` or `write` tools