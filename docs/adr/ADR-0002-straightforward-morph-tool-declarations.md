---
title: "Straightforward Morph Tool Declarations"
adr: ADR-0002
status: Proposed
date: 2026-05-15
prd: "PRD-001-morph-runtime-integration"
decision: "Expose Morph model tools with straightforward self-explanatory names and labels; avoid activator stubs"
provenance:
  pi_session:
    id: "019e2e39-246e-77dc-8b1e-90b3f17e48b1"
    name: "Morph Runtime Integration Specdocs"
    file: "/Users/victor/.pi/agent/sessions/--Users-victor-workspace-victor-pi-ecosystem-pi-fast-apply--/2026-05-16T00-39-17-359Z_019e2e39-246e-77dc-8b1e-90b3f17e48b1.jsonl"
    cwd: "/Users/victor/workspace/victor/pi-ecosystem/pi-fast-apply"
    started_at_brt: "2026-05-15T21:41:51-03:00"
  created_at_brt: "2026-05-15"
---

# ADR-0002: Straightforward Morph Tool Declarations

## Status

Proposed

## Date

2026-05-15

## Requirement Source

* **PRD**: [docs/prd/PRD-001-morph-runtime-integration.md](../prd/PRD-001-morph-runtime-integration.md)
* **Decision Point**: REQ-004 WarpGrep provides isolated local codebase search; REQ-005 GitHub search uses Morph WarpGrep for public repos; REQ-008 Morph tools use straightforward names and concise declarations

## Context

Pi sends active model-facing tools to providers through multiple surfaces: provider function metadata, the `Available tools` prompt section, and tool `promptGuidelines`. Excessive always-on tool metadata is bad, but prior experiments with model-facing activator stubs were unreliable: the model often failed to activate the right family or wasted turns on activation instead of doing the work.

Morph's own docs and examples repeatedly use direct, task-shaped tool names for coding agents. The strongest search name is `codebase_search`; Morph examples note that the parent model understands this better than vague names such as `grep` or over-branded names. Pi also separates model-facing `name` from operator-facing `label`, so the model can see stable snake\_case names while the operator sees readable labels such as `Fast Apply` and `Codebase Search`.

The package currently exposes one model-facing tool, `fast_apply`, with label `Fast Apply`. Broader tools should follow that pattern: self-explanatory model names, readable labels, concise schemas, and short descriptions. Compact should primarily integrate through Pi lifecycle hooks and commands, not as a large model-facing tool by default.

## Decision Drivers

* Activator stubs have not worked reliably in practice.
* Search tools must be obvious to the model without requiring a pre-activation turn.
* Morph recommends `codebase_search` semantics for WarpGrep-style code search tools.
* Existing `fast_apply` name and `Fast Apply` label must remain stable.
* Tool metadata must still be concise enough to avoid prompt bloat.
* Remote/GitHub search and compacted excerpt experiments should be phased rather than bundled into the first local search tool.

## Considered Options

### Option 1: Use model-facing activator stubs

Keep specialist Morph tools hidden and expose a tiny tool such as `morph_search_enable` that activates real tools with `pi.setActiveTools()` on the next turn.

* Good, because inactive tools do not cost provider schema/prompt tokens.
* Good, because Pi supports active tool sets.
* Bad, because activators have not been reliable in real use.
* Bad, because activation adds an extra turn and state restoration complexity.
* Bad, because the model may never discover or choose the activator when it needs search.

### Option 2: Expose straightforward always-available Morph tools with concise declarations

Register a small set of self-explanatory Morph tools directly, such as `fast_apply`, `codebase_search`, and a later GitHub search tool, each with readable labels and tight schemas.

* Good, because the model can call the right tool immediately.
* Good, because names match existing tool patterns and Morph recommendations.
* Good, because implementation avoids fragile activation state.
* Bad, because each active tool adds provider-visible metadata.
* Bad, because tool descriptions must stay disciplined to avoid context bloat.

### Option 3: Expose broader Morph capabilities only as slash commands

Make search and compaction operator-only commands, not model-facing tools.

* Good, because model-visible context stays minimal.
* Good, because operator has explicit control.
* Bad, because search is most useful when the model can request it during code exploration.
* Bad, because the user would need to mediate normal agent search loops manually.

## Decision

Chosen option: **"Expose straightforward always-available Morph tools with concise declarations"**, because direct tool names are more reliable than activator stubs and fit both Pi's current tool patterns and Morph's model-facing guidance.

Initial naming policy:

| Capability           | Model-facing name     | Operator label                        | Notes                                             |
| -------------------- | --------------------- | ------------------------------------- | ------------------------------------------------- |
| Fast Apply           | `fast_apply`          | Fast Apply                            | Existing public tool; keep stable.                |
| Local WarpGrep       | `codebase_search`     | Codebase Search                       | Use Morph-recommended semantic search name.       |
| Public GitHub search | `github_code_search`  | GitHub Code Search                    | Later phase; public repos only.                   |
| Compact              | No default model tool | Morph Compact / command or hook label | Integrate through `session_before_compact` first. |

Each model-facing tool must keep its schema small, use natural-language search parameters, and state when native `grep`/`find` is better.

## Consequences

### Positive

* Existing `fast_apply` workflows stay unchanged.
* The model sees obvious tools without a separate activation step.
* Local search can use Morph's recommended `codebase_search` naming.
* Operator UI can remain readable through labels and renderers.
* Implementation avoids session-local activation state and follow-up turn plumbing.

### Negative

* Baseline model-visible tool metadata grows when `codebase_search` ships.
* Concise descriptions and schemas become more important because there is no hidden-tool fallback.
* Future tool growth may still need a separate tool-surface review if the Morph family expands too far.

### Neutral

* Compact remains mostly lifecycle/command-driven, not always a model-facing tool.
* Remote search, GitHub search, and compacted excerpt experiments are phased after local search.

## Related

* **Plan**: [docs/architecture/plan-morph-runtime-integration.md](../architecture/plan-morph-runtime-integration.md)
* **ADRs**: [ADR-0001](ADR-0001-pi-owned-file-mutation-for-morph-apply.md), [ADR-0003](ADR-0003-pi-auth-storage-for-morph-secrets.md)
* **Implementation**: future `codebase_search` and `github_code_search` tools in `extensions/index.ts` or split Morph search module

## Creation Provenance

| Field                 | Value                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Created in Pi session | `019e2e39-246e-77dc-8b1e-90b3f17e48b1`                                                                                                                              |
| Session file          | `/Users/victor/.pi/agent/sessions/--Users-victor-workspace-victor-pi-ecosystem-pi-fast-apply--/2026-05-16T00-39-17-359Z_019e2e39-246e-77dc-8b1e-90b3f17e48b1.jsonl` |
| Session name          | Morph Runtime Integration Specdocs                                                                                                                                  |
| Created               | 2026-05-15 BRT                                                                                                                                                      |
