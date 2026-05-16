---
title: "Pi Auth Storage for Morph Secrets"
adr: ADR-0003
status: Proposed
date: 2026-05-15
prd: "PRD-001-morph-runtime-integration"
decision: "Use Pi auth storage plus MORPH_API_KEY env fallback for Morph secrets; do not create Morph JSON secret config"
---

# ADR-0003: Pi Auth Storage for Morph Secrets

## Status

Proposed

## Date

2026-05-15

## Requirement Source

* **PRD**: [docs/prd/PRD-001-morph-runtime-integration.md](../prd/PRD-001-morph-runtime-integration.md)
* **Decision Point**: REQ-003 Morph probe verifies live runtime health; REQ-009 Config avoids global runtime mutation

## Context

The package already supports `/morph-login`, `/morph-logout`, and `/morph-status`. It stores Morph API keys under the provider id `morph` in Pi auth storage and falls back to `MORPH_API_KEY` when no stored key exists. This matches Pi's operator workflow and avoids package-specific plaintext key files.

Research into another Morph plugin showed a broader config approach with Morph-specific JSON files, multi-key rotation, and auto-created global configuration. That pattern offers convenience, but it creates a second secret storage system and risks global runtime mutation. This package is installed into Pi, which already has an auth storage mechanism and may run in env-stripped launch contexts where shell-only secrets are unreliable.

The broader Morph runtime integration will add `/morph-probe`, search, and Compact. Those features need shared auth/config resolution, but not a new secret store.

## Decision Drivers

* PRD requires no plaintext Morph secrets in package-specific global/project JSON config.
* Current `/morph-login` user contract should remain stable.
* Pi processes may not inherit interactive shell env, so Pi auth storage must remain first-class.
* Some operators prefer external secret managers; `MORPH_API_KEY` fallback keeps that path available.
* Future non-secret settings may need config, but secret and non-secret config should not be conflated.

## Considered Options

### Option 1: Pi auth storage first, `MORPH_API_KEY` fallback

Keep current auth chain: `ctx.modelRegistry.authStorage` provider id `morph`, then explicit `MORPH_API_KEY` env var.

* Good, because it preserves current commands and user expectations.
* Good, because it works when Pi is launched without shell env after `/morph-login` stores the key.
* Good, because it avoids a package-specific secret file.
* Good, because env fallback still supports fnox, mise, `.env`, or external secret injection.
* Bad, because advanced features like multi-key rotation are not built in.

### Option 2: Morph-specific config JSON with secrets

Create global/project Morph config files that can include keys, base URL, model choices, and rotation settings.

* Good, because all Morph settings live in one package-owned place.
* Good, because multi-key rotation is easier to model.
* Bad, because plaintext key files increase secret sprawl.
* Bad, because auto-creation/mutation of global config creates surprising side effects.
* Bad, because it duplicates Pi auth storage instead of using the host runtime's mechanism.

### Option 3: Environment variable only

Require `MORPH_API_KEY` and remove Pi auth storage commands.

* Good, because implementation is simple.
* Good, because operators can use external secret managers.
* Bad, because Pi is not guaranteed to inherit shell env in app/launcher/launchd contexts.
* Bad, because it removes existing `/morph-login` workflow.
* Bad, because `/morph-probe` would report false missing-auth failures for users who expected Pi auth storage.

## Decision

Chosen option: **"Pi auth storage first, `MORPH_API_KEY` fallback"**, because it uses Pi's existing credential path, preserves current UX, and avoids package-specific plaintext secret config.

Non-secret settings such as base URL, timeout, apply model tier, and compaction thresholds may use env vars or future explicit settings. Morph API keys must remain in Pi auth storage or external env injection.

## Consequences

### Positive

* `/morph-login`, `/morph-logout`, and `/morph-status` remain stable.
* `/morph-probe` can accurately classify `auth.json`, env, or missing auth.
* No new secret storage file must be secured, migrated, or documented.
* Env fallback supports secret managers and temporary credentials.

### Negative

* Multi-key rotation is deferred.
* Project-specific Morph credentials are not modeled unless the operator injects env per project.
* Future settings work must separate non-secret config from secret storage.

### Neutral

* Pi auth storage file permissions and at-rest properties are inherited from Pi; stronger at-rest encryption remains an operator secret-manager choice.
* Private GitHub search, if ever supported, will require a separate auth/security decision.

## Related

* **Plan**: [docs/architecture/plan-morph-runtime-integration.md](../architecture/plan-morph-runtime-integration.md)
* **ADRs**: [ADR-0001](ADR-0001-pi-owned-file-mutation-for-morph-apply.md), [ADR-0002](ADR-0002-progressive-disclosure-for-morph-tool-family.md)
* **Implementation**: `extensions/index.ts` `resolveMorphApiKey()`, `/morph-login`, `/morph-logout`, `/morph-status`, future `/morph-probe`

## Creation Provenance

| Field                 | Value                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Created in Pi session | `019e2e39-246e-77dc-8b1e-90b3f17e48b1`                                                                                                                              |
| Session file          | `/Users/victor/.pi/agent/sessions/--Users-victor-workspace-victor-pi-ecosystem-pi-fast-apply--/2026-05-16T00-39-17-359Z_019e2e39-246e-77dc-8b1e-90b3f17e48b1.jsonl` |
| Session name          | Morph Runtime Integration Specdocs                                                                                                                                  |
| Created               | 2026-05-15 BRT                                                                                                                                                      |
