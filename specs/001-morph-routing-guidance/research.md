# Research: Improve morph_edit Routing Guidance

## Decision 1: Keep the tool surface unchanged and improve only routing metadata plus supporting documentation

**Decision**: Refine the existing `morph_edit` description, prompt snippet, and prompt guidelines, and reinforce the same rules in package documentation instead of adding new parameters or new editing tools.

**Rationale**: The repo constitution requires a minimal tool surface and decision-oriented metadata. The feature request is specifically about better routing guidance, first-person instruction wording, and correct fallback behavior, not about missing tool capabilities. The existing tool schema already contains the necessary fields: `path`, `instruction`, `codeEdit`, and optional `dryRun`.

**Alternatives considered**:
- Add new routing flags or explicit mode parameters to `morph_edit` — rejected because it expands the schema without evidence of operator need.
- Override Pi's native `edit` behavior — rejected because the roadmap explicitly preserves `morph_edit` as a separate tool with clear fallback guidance.
- Introduce a second Morph tool for complex edits only — rejected because it would increase model confusion and duplicate responsibility.

## Decision 2: Route to morph_edit based on edit fragility and dispersion, not just file size

**Decision**: Define the primary routing rule as: use `morph_edit` for scattered changes in one existing file or when exact `oldText` matching would be fragile; use `edit` for small exact replacements; use `write` for new files or full-file replacement.

**Rationale**: The current `extensions/index.ts` description emphasizes large files and scattered edits, while the spec and roadmap make fragility equally important. The final routing rule must cover both dispersed edits and brittle exact-match situations so the model does not reserve `morph_edit` only for large-file work.

**Alternatives considered**:
- Keep size-focused wording such as “large files” as the primary trigger — rejected because it under-specifies fragile small edits.
- Prefer `morph_edit` for most existing-file edits — rejected because it would weaken the role of Pi's native `edit` tool for simple exact replacements.
- Route based only on number of changed regions — rejected because a single-region edit can still be a fragile fit for exact replacement.

## Decision 3: Express instruction quality as a short first-person rule with one concrete example

**Decision**: Require `instruction` text to be first person, specific, and phrased as a direct description of the intended change, supported by one concise example.

**Rationale**: The tool parameter schema already includes a good example sentence, and the feature spec requires the model to produce Morph-ready instructions without extra operator correction. A short first-person rule plus example is enough to reinforce the desired pattern without turning metadata into a manual.

**Alternatives considered**:
- Provide multiple long examples for different change types — rejected because it increases prompt size and duplicates information better covered by docs.
- Leave first-person wording only in parameter descriptions — rejected because routing guidance should repeat the most important rule in model-facing prompt guidance.
- Specify grammatical rules in detail — rejected because the model only needs a memorable pattern, not writing theory.

## Decision 4: Keep codeEdit guidance focused on partial edits with unique anchors and unchanged-code markers

**Decision**: State that `codeEdit` should include only changed sections, preserve indentation, and use `// ... existing code ...` markers around omitted unchanged regions, with enough surrounding context to anchor each edit uniquely.

**Rationale**: This matches the current tool contract, the README tool contract, and the roadmap's suggested prompt guidance. It reinforces partial semantic editing instead of whole-file rewriting or exact-string replacement thinking.

**Alternatives considered**:
- Allow full-file rewrites through `morph_edit` by default — rejected because the tool is intentionally scoped to existing-file partial edits and should fall back to `write` for full replacement.
- Omit the context-anchor reminder — rejected because multiple scattered edits need clear local anchors for reliable merges.
- Require markers for every edit regardless of file shape — rejected because the implementation already allows trivial files without forcing extra ceremony.

## Decision 5: Align all operator-visible guidance around one concise routing policy

**Decision**: Keep the same routing policy in `extensions/index.ts`, the README tool contract, and roadmap-facing documentation so maintainers and models see one consistent rule set.

**Rationale**: The feature spec explicitly calls for consistency across the main tool description and supporting package docs. Inconsistent phrasing across files would weaken confidence in the intended routing behavior and make regressions harder to spot during review.

**Alternatives considered**:
- Update only the runtime tool metadata — rejected because the README is part of the operator-visible contract for this package.
- Put all nuance only in the README and keep tool metadata generic — rejected because the runtime metadata is the primary model-facing source.
- Copy long-form guidance verbatim into every file — rejected because consistency should come from shared decision rules, not duplicated verbosity.

## Decision 6: Set the token ceiling at 1400 characters (~350 tokens) for morph_edit model-facing metadata

**Decision**: Define SC-003 ceiling as **1400 characters** (~350 tokens) for the combined morph_edit tool description, promptSnippet, promptGuidelines, and parameter descriptions.

**Rationale**: Measurement of the three editing tools in the current Pi session:

| Tool | Description | Snippet | Guidelines | Params | Total |
|------|------------|---------|------------|--------|-------|
| `morph_edit` (current) | 136 chars | 125 chars | 289 chars (3 bullets) | 333 chars (4 params) | **883 chars (~221 tok)** |
| `morph_edit` (PIM-004 proposed) | 296 chars | 127 chars | 445 chars (3 bullets) | 333 chars (4 params) | **1201 chars (~301 tok)** |
| `edit` (Pi built-in) | 326 chars | 98 chars | 493 chars (4 bullets) | 468 chars (4 params) | **1385 chars (~347 tok)** |
| `write` (Pi built-in) | 127 chars | 25 chars | 50 chars (1 bullet) | 76 chars (2 params) | **278 chars (~70 tok)** |
| opencode-morph-plugin desc+routing | 1358 + 183 chars | — | — | — | **1541 chars (~386 tok)** |

The ceiling of 1400 chars:
- Comfortably fits the PIM-004 proposed wording (1201 chars, 86% of ceiling)
- Stays at or below Pi's built-in `edit` tool footprint (1385 chars)
- Leaves ~200 chars of headroom for future refinement without a ceiling revision
- Is significantly leaner than opencode-morph-plugin's 1541-char approach
- Is measured by summing `description.length + promptSnippet.length + sum(promptGuidelines[].length) + sum(parameterDescriptions[].length)` in the registered tool metadata

Pi injects tool metadata into two system prompt sections:
- **Available tools**: `"- morph_edit: {promptSnippet}"` (one line per tool)
- **Guidelines**: each `promptGuidelines[]` entry becomes a `"- {guideline}"` bullet (deduplicated)

The tool `description` and parameter `description` fields are sent via function-calling tool schema, not the system prompt text.

**Alternatives considered**:
- Token-based ceiling instead of character-based — rejected because token counting depends on the tokenizer (cl100k_base, o200k, etc.) and varies by model. Character count is deterministic, measurable in code, and the ~4 chars/token approximation is close enough for budget enforcement.
- Ceiling equal to current (883 chars) — rejected because the proposed routing improvements require a richer description and cannot fit in the current footprint.
- No ceiling, rely on review judgment — rejected because FR-008 and SC-003 explicitly require a measurable constraint.

## Decision 7: Use pi-test-harness playbook tests for programmatic scenario verification, with RPC as a documented stretch path

**Decision**: Implement SC-005 programmatic scenario tests using `@marcfargas/pi-test-harness` playbook-driven integration tests as the primary verification method. Document Pi's RPC client as a viable but heavier alternative for future cross-model live testing.

**Rationale**: Pi provides two programmatic paths for tool-choice verification:

### Path A: pi-test-harness playbooks (recommended)

The `@marcfargas/pi-test-harness` package creates a real Pi session with a substituted `streamFn`. A playbook scripts what the model "decides" — the test author specifies exactly which tool calls the model makes. The harness then:
- Runs the tool through Pi's real extension registry
- Fires all hooks and events
- Collects events via `t.events.toolCallsFor()`, `t.events.toolSequence()`, etc.

For routing guidance verification, this means:
- Write scenarios where the playbook calls `morph_edit` for scattered/fragile edits and verify it succeeds
- Write scenarios where the playbook calls `edit` for small exact replacements and verify it succeeds
- Write scenarios where the playbook calls `write` for new files and verify it succeeds
- Verify that `morph_edit` rejects new-file creation attempts (the tool throws)
- Verify that `morph_edit` requires `// ... existing code ...` markers for non-trivial files

This tests the **tool contract enforcement** side of routing — confirming that the tools behave correctly when chosen — but does not test **model decision-making** (whether a live model reads the guidance and picks the right tool).

### Path B: Pi RPC client (stretch goal for live model testing)

Pi ships an `RpcClient` class (`@mariozechner/pi-coding-agent/dist/modes/rpc/rpc-client`) that:
- Spawns Pi in headless RPC mode
- Accepts `prompt()` commands
- Emits `AgentEvent` objects including `tool_execution_start` with `toolName` and `args`
- Supports `promptAndWait()` and `collectEvents()` for scripted verification
- Allows `setModel()` to switch providers/models between runs

This could drive true cross-model tool-choice tests:
1. Start `RpcClient` with the pi-morph extension loaded
2. Send a routing scenario prompt ("Edit this file to add imports at the top and change the return type at the bottom")
3. Collect events and assert `tool_execution_start.toolName === 'morph_edit'`
4. Repeat with different models via `setModel()`

However, this path:
- Requires real LLM API keys and incurs cost per run
- Is non-deterministic (model may choose differently across runs)
- Needs careful prompt design to isolate tool choice from task complexity
- Is better suited for periodic validation than gated CI

### Recommendation for SC-005

Phase 1 (this feature): Implement pi-test-harness playbook tests that verify the **tool contract** — correct behavior when each tool is chosen, and correct rejection when misused. This satisfies the "programmatic scenario testing" requirement with deterministic, cost-free tests.

Phase 2 (follow-up): Add RPC-based live model tests as an optional validation suite. Document the test harness, scenarios, and expected results so they can be run manually or in CI with appropriate cost controls.

**Alternatives considered**:
- Only manual review per quickstart.md — rejected because SC-005 explicitly requires programmatic testing.
- Only RPC live model tests — rejected for Phase 1 because they are non-deterministic, costly, and the RPC testing path is not yet proven for this use case.
- External test framework (e.g., pytest, custom scripts) — rejected because Pi already provides purpose-built testing infrastructure.
- Defer all programmatic testing — rejected because it would leave SC-005 unmet.