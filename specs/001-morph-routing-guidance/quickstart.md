# Quickstart: Validate morph_edit Routing Guidance

## Goal

Verify that the final routing guidance leads maintainers and reviewers to the intended tool choice and request shape before implementation work begins.

## Inputs

Review these files together:
- `extensions/index.ts`
- `README.md`
- `specs/001-morph-routing-guidance/contracts/morph-edit-routing-guidance.md`
- `specs/001-morph-routing-guidance/research.md`

## Validation Steps

1. Read the `morph_edit` tool description, prompt snippet, and prompt guidelines in `extensions/index.ts`.
2. Confirm the same routing policy appears in `README.md` without contradiction.
3. Check that the guidance distinguishes the following cases clearly:
   - scattered edits in one existing file
   - fragile exact-match situations in one existing file
   - small exact replacements in existing files
   - new-file creation
   - full-file replacement
4. Check that every `morph_edit` instruction example is first person and specific.
5. Check that `codeEdit` guidance emphasizes changed regions plus `// ... existing code ...` markers rather than whole-file rewrites.
6. Run repository verification after implementation:
   - `bun run typecheck`
   - `bun run lint`

## Representative Review Examples

### Example A: Scattered change

Request: update imports, add validation in one function, and adjust an exported type in the same existing file.

Expected result: guidance points to `morph_edit`.

### Example B: Fragile single-region change

Request: update a block in an existing file where exact old text may drift because formatting or nearby content is unstable.

Expected result: guidance points to `morph_edit`.

### Example C: Small exact replacement

Request: rename one string literal or replace one stable exact expression in an existing file.

Expected result: guidance points to `edit`.

### Example D: New file

Request: create a new helper file.

Expected result: guidance points to `write`.

### Example E: Full rewrite

Request: replace the contents of an existing file completely.

Expected result: guidance points to `write`.

## Exit Criteria

The feature is ready for `/spec tasks` when:
- all representative examples map to one unambiguous tool choice
- no file contradicts the routing rules in the contract
- first-person instruction guidance is present
- partial-edit marker guidance is present
- planned implementation scope remains limited to metadata and documentation refinement