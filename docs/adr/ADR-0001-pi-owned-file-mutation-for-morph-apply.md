---
title: "Pi-Owned File Mutation for Morph Apply"
adr: ADR-0001
status: Proposed
date: 2026-05-15
prd: "PRD-001-morph-runtime-integration"
decision: "Use Morph only for semantic merge; keep file I/O, validation, dry-run, queueing, and writes inside Pi"
---

# ADR-0001: Pi-Owned File Mutation for Morph Apply

## Status

Proposed

## Date

2026-05-15

## Requirement Source

* **PRD**: [docs/prd/PRD-001-morph-runtime-integration.md](../prd/PRD-001-morph-runtime-integration.md)
* **Decision Point**: REQ-001 Fast Apply remains Pi-owned for file I/O; REQ-002 Fast Apply exposes explicit model selection

## Context

`pi-fast-apply` integrates Morph Fast Apply into Pi. Morph offers high-level SDK helpers that can read/write files, but the current package uses low-level `applyEdit()` with explicit `originalCode`, `codeEdit`, and `instruction`. Pi resolves paths, reads files, validates inputs, sends code to Morph for semantic merge, validates returned output, and writes through `withFileMutationQueue` only when `dryRun` is false.

The broader Morph runtime integration will add `/morph-probe`, explicit model selection, WarpGrep, GitHub search, and Compact. Before adding more capability, the package needs a durable boundary for what Morph may do to local files. Without that boundary, future contributors could choose SDK convenience APIs that bypass Pi's dry-run behavior, mutation queueing, renderer details, or safety checks.

## Decision Drivers

* PRD requires `fast_apply` backward compatibility and no regression in dry-run behavior.
* Pi provides local path resolution, mutation queueing, and operator-visible rendering that Morph SDK cannot own safely.
* Morph API outages or malformed merge output must not corrupt user files.
* Model-generated `codeEdit` can be malformed, marker-free, or unsafe; validation must happen before writes.
* Future local search/compact features should not blur the file-mutation boundary.

## Considered Options

### Option 1: Use Morph SDK high-level file apply with auto-write

Call SDK helpers such as `morph.fastApply.execute()` with file path/base directory options and allow SDK-level file operations where available.

* Good, because it reduces package code and follows quickstart examples.
* Good, because the SDK may add convenience features automatically.
* Bad, because SDK writes would bypass Pi's `withFileMutationQueue` guarantees.
* Bad, because dry-run, diff rendering, validation, and error phrasing would become less predictable.
* Bad, because future SDK behavior changes could affect local files without review in this package.

### Option 2: Use Morph only as code-in/code-out semantic merge

Continue calling `applyEdit()` with code strings and apply returned output only after Pi validation.

* Good, because Pi keeps all local file side effects explicit and reviewable.
* Good, because the current `fast_apply` contract, dry-run behavior, diff rendering, and mutation queueing stay stable.
* Good, because validation can reject empty output or leaked `// ... existing code ...` markers before write.
* Bad, because package code must own more plumbing around file reads, writes, and result rendering.
* Bad, because new SDK convenience features do not apply automatically.

### Option 3: Hybrid path selected by config

Offer both Pi-owned code-in/code-out apply and SDK high-level auto-write behind configuration.

* Good, because advanced users could opt into SDK convenience.
* Bad, because it creates two safety models and doubles validation/test burden.
* Bad, because mistakes in config could silently switch file ownership semantics.
* Bad, because the package's core promise becomes harder to explain.

## Decision

Chosen option: **"Use Morph only as code-in/code-out semantic merge"**, because Pi must own local file mutation, validation, dry-run semantics, and operator UX.

Morph may produce a merged candidate. Pi decides whether that candidate is safe, how it is rendered, and whether it is written.

## Consequences

### Positive

* `fast_apply` remains compatible with existing package behavior.
* Dry-run remains trustworthy because Pi controls write timing.
* File writes remain serialized through `withFileMutationQueue`.
* Validation stays close to Pi-specific tool semantics and user-facing errors.
* Future contributors have a clear rule: Morph can transform content, not mutate local state.

### Negative

* The package must maintain local helper code for reads, writes, validation, diffs, and rendering.
* SDK high-level features such as auto-write cannot be adopted directly.
* Probe and tests must cover local plumbing as well as Morph API calls.

### Neutral

* Future Morph APIs may still be used if they preserve code-in/code-out semantics.
* This ADR applies to file mutation, not to read-only features such as WarpGrep search or Compact.

## Related

* **Plan**: [docs/architecture/plan-morph-runtime-integration.md](../architecture/plan-morph-runtime-integration.md)
* **ADRs**: [ADR-0002](ADR-0002-progressive-disclosure-for-morph-tool-family.md), [ADR-0003](ADR-0003-pi-auth-storage-for-morph-secrets.md)
* **Implementation**: `extensions/index.ts` `applyEdit()` flow and future `/morph-probe`

## Creation Provenance

| Field                 | Value                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Created in Pi session | `019e2e39-246e-77dc-8b1e-90b3f17e48b1`                                                                                                                              |
| Session file          | `/Users/victor/.pi/agent/sessions/--Users-victor-workspace-victor-pi-ecosystem-pi-fast-apply--/2026-05-16T00-39-17-359Z_019e2e39-246e-77dc-8b1e-90b3f17e48b1.jsonl` |
| Session name          | Morph Runtime Integration Specdocs                                                                                                                                  |
| Created               | 2026-05-15 BRT                                                                                                                                                      |
