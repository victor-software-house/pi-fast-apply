<!--
  Sync Impact Report
  ===================
  Version change: N/A → 1.0.0 (initial ratification)

  Added principles:
    I.   Pi-Native First
    II.  Morph as Semantic Engine
    III. Minimal Tool Surface
    IV.  Operator Safety
    V.   Incremental Delivery

  Added sections:
    - Technology Stack & Constraints
    - Development Workflow

  Removed sections: none (initial version)

  Templates requiring updates:
    ✅ plan-template.md — Constitution Check section aligns with principles
    ✅ spec-template.md — no changes needed; requirements and success criteria are generic
    ✅ tasks-template.md — no changes needed; task phases are generic
    ✅ checklist-template.md — no changes needed
    ✅ agent-file-template.md — no changes needed

  Follow-up TODOs: none
-->

# pi-morph Constitution

## Core Principles

### I. Pi-Native First

Every capability MUST start as a Pi-native extension surface using
Pi's runtime primitives (tool registration, path resolution, file
mutation queueing, TUI rendering). MCP MUST NOT be the default
integration path when a Pi-native tool achieves the same outcome.

Rationale: Pi ownership of the tool lifecycle ensures consistent
operator UX, correct queueing semantics, and access to Pi context
that MCP proxying cannot provide.

### II. Morph as Semantic Engine

The Morph SDK is used exclusively for the semantic merge step.
Pi MUST own all file I/O (reads, writes, directory creation),
input validation, output validation, and operator-visible messaging.
Morph receives original code and a partial edit; Pi decides what
happens with the result.

Rationale: Keeping file I/O inside Pi preserves `withFileMutationQueue`
safety, enables dry-run previews without SDK changes, and ensures
Morph service outages degrade gracefully with actionable errors.

### III. Minimal Tool Surface

Tool schemas MUST remain small and disciplined. New parameters
require demonstrated evidence of model or operator need. Tool
descriptions MUST be decision-oriented (when to use this tool vs
alternatives) rather than exhaustive reference documentation.
Prompt guidelines MUST encode the fewest rules that produce
high-quality edits.

Rationale: Context-efficient tool metadata reduces model confusion,
keeps token budgets focused on the actual task, and prevents
kitchen-sink parameter drift.

### IV. Operator Safety

All tool inputs and outputs MUST be validated defensively:
- Empty or marker-leaked merge results MUST be rejected before write.
- New file creation via `morph_edit` MUST be refused; use `write`.
- Non-trivial files MUST require `// ... existing code ...` markers.
- Errors MUST produce actionable operator-visible messages that name
  the failed constraint and suggest a corrective action.

Rationale: The model can produce malformed edits. Defensive validation
at the Pi layer catches these before they corrupt user files.

### V. Incremental Delivery

Features MUST ship in small, verified slices. Each roadmap item MUST
have explicit acceptance criteria. Manual validation against real
credentials MUST precede any claim of "working" status. Discovered
limitations MUST be captured as explicit follow-up items rather than
silently deferred.

Rationale: Small slices reduce blast radius, keep the repo in a
shippable state, and ensure documentation matches actual capability.

## Technology Stack & Constraints

- **Runtime**: Bun (TypeScript, ESM, strict mode)
- **Extension host**: `@mariozechner/pi-coding-agent` extension API
- **Morph SDK**: `@morphllm/morphsdk` (official Fast Apply client)
- **Schema**: `@sinclair/typebox` for tool parameter definitions
- **Lint**: Biome + oxlint (strict, no suppressions without justification)
- **Type checking**: `tsc --noEmit` (strict TypeScript config)
- **Hooks**: lefthook (pre-commit lint + typecheck gates)
- **Release**: semantic-release from `main` via Conventional Commits
- **Credentials**: `MORPH_API_KEY` via environment; Pi auth storage
  path planned (see ROADMAP PIM-005)

## Development Workflow

1. **Verify before committing**: `bun run typecheck && bun run lint`
   MUST pass. No commits with known type or lint failures.
2. **Auto-fix first**: Run `bun run fix && bun run format` before
   making manual style-only edits.
3. **Conventional Commits**: All commits MUST follow the Conventional
   Commits specification. Commit messages drive semantic-release.
4. **Small slices**: Each commit MUST be a reviewable, self-contained
   change. Avoid bundling unrelated work.
5. **Import discipline**: Use single quotes, omit file extensions in
   import paths, use `import type` for type-only imports. Do not
   import hidden Pi internals from non-public paths.

## Governance

This constitution is the authoritative source for non-negotiable
project rules. All code changes, tool designs, and documentation
updates MUST comply with the principles above.

**Amendment procedure**:
1. Propose the change with rationale in a PR or conversation.
2. Document the old and new text.
3. Increment the version per semantic versioning:
   - MAJOR: principle removal or backward-incompatible redefinition.
   - MINOR: new principle or materially expanded guidance.
   - PATCH: clarification, wording, or typo fix.
4. Update `LAST_AMENDED_DATE` to the amendment date.

**Compliance review**: The Constitution Check gate in plan templates
MUST be evaluated before Phase 0 research and re-checked after
Phase 1 design for every feature specification.

**Version**: 1.0.0 | **Ratified**: 2026-04-02 | **Last Amended**: 2026-04-02
