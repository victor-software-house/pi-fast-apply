---
title: "Progressive Disclosure for Morph Tool Family"
adr: ADR-0002
status: Proposed
date: 2026-05-15
prd: "PRD-001-morph-runtime-integration"
decision: "Keep fast_apply as the baseline Morph tool and expose broader Morph search tools through progressive disclosure"
---

# ADR-0002: Progressive Disclosure for Morph Tool Family

## Status

Proposed

## Date

2026-05-15

## Requirement Source

* **PRD**: [docs/prd/PRD-001-morph-runtime-integration.md](../prd/PRD-001-morph-runtime-integration.md)
* **Decision Point**: REQ-004 WarpGrep provides isolated local codebase search; REQ-005 GitHub search uses Morph WarpGrep for public repos; REQ-008 Morph tools use progressive disclosure

## Context

Pi sends active model-facing tools to providers through multiple surfaces: provider function metadata, the `Available tools` prompt section, and tool `promptGuidelines`. Every always-active Morph tool adds name, description, parameter schema, and possibly prompt guidance to every turn, even when the user is not searching or compacting.

The package currently has one always-active model-facing tool: `fast_apply`. That is appropriate because Fast Apply is the package's core public behavior and existing users expect it. Future Morph capabilities are different. Local WarpGrep and public GitHub search are specialist capabilities for broad semantic exploration. They are useful, but not needed on every edit turn. Compact is mostly a lifecycle/command/middleware feature, not necessarily a model-facing tool.

Current Pi supports `pi.setActiveTools()` for dynamic active-tool control. Disabled tools disappear from model-visible callable tools, `Available tools`, and active tool guidelines on the next turn. Pi extension guidance recommends small activator stubs for hidden specialist families when the model needs discoverability.

## Decision Drivers

* PRD requires context-efficient Morph expansion without bloating unrelated Pi turns.
* Search tools need richer descriptions and schemas than `fast_apply`; always-on cost would accumulate.
* The model still needs a discoverable path to broad semantic search when native grep is insufficient.
* Existing `fast_apply` name and availability must remain stable.
* Activation state must behave correctly across resume, fork, tree navigation, new sessions, and compaction.

## Considered Options

### Option 1: Make all Morph model tools always active

Register `fast_apply`, local search, GitHub search, and future Morph tools as always visible to the model.

* Good, because implementation is simple.
* Good, because the model can call any Morph tool without an activation step.
* Bad, because every turn pays context/schema cost for tools irrelevant to many tasks.
* Bad, because prompt snippets and guidelines for multiple specialist tools can dilute tool selection.
* Bad, because future Morph expansion would keep increasing baseline context cost.

### Option 2: Keep only `fast_apply` always active and hide specialist tools behind activation

Keep `fast_apply` as baseline. Add a small activation/control surface for Morph search family. Use `pi.setActiveTools()` so local and GitHub search become visible only after activation.

* Good, because it preserves existing `fast_apply` behavior.
* Good, because specialist tool schemas/guidance only appear when likely useful.
* Good, because it matches Pi progressive-disclosure guidance and current runtime capabilities.
* Bad, because implementation must manage activation state and follow-up turn behavior.
* Bad, because the model may need one extra step before using search.

### Option 3: Expose search only through slash commands

Make broader Morph search operator-only, with no model-facing search tools.

* Good, because model-visible context stays minimal.
* Good, because operator has explicit control.
* Bad, because search is most useful when the model can request it during code exploration.
* Bad, because it forces the user to mediate normal agent search loops manually.

## Decision

Chosen option: **"Keep only `fast_apply` always active and expose broader Morph search tools through progressive disclosure"**, because it balances discoverability, model autonomy, and context cost.

`fast_apply` remains baseline. Local WarpGrep and public GitHub search should belong to a Morph search family that is inactive by default. Activation can be model-triggered through a minimal activator, operator-triggered through a command, or both, but the full search tool metadata should not be present in every fresh session.

## Consequences

### Positive

* Existing `fast_apply` workflows stay unchanged.
* Future local/GitHub search tools can have accurate schemas and guidance without taxing every session.
* Morph family growth gets a scalable pattern instead of an always-on tool pile.
* Active-tool state can be reasoned about through named families.

### Negative

* Activation adds implementation complexity.
* If activation is model-triggered, the current turn may need a follow-up because `pi.setActiveTools()` takes effect next turn.
* Poorly designed activator text could still under-describe search and make tools hard to discover.

### Neutral

* Compact does not automatically need a model-facing tool; it can ship through lifecycle hooks and operator commands.
* The exact activation UX remains an implementation-plan open question, but the always-on-vs-progressive-disclosure decision is settled.

## Related

* **Plan**: [docs/architecture/plan-morph-runtime-integration.md](../architecture/plan-morph-runtime-integration.md)
* **ADRs**: [ADR-0001](ADR-0001-pi-owned-file-mutation-for-morph-apply.md), [ADR-0003](ADR-0003-pi-auth-storage-for-morph-secrets.md)
* **Implementation**: future search family activation in `extensions/index.ts` or split Morph search module
