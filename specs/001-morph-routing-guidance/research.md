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