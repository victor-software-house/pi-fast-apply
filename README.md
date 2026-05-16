# pi-fast-apply

[Morph](https://www.morphllm.com/) Fast Apply for [Pi](https://github.com/badlogic/pi-mono). A native `fast_apply` tool that edits existing files using partial code snippets and semantic merging — no exact `oldText` matching required.

## Why

- **Handles scattered changes** — multiple disjoint edits in one file, one call, no fragile string anchors
- **Semantic merging** — Morph resolves partial snippets against the real file; the model provides only what changed
- **Pi-native** — path resolution, mutation queueing, and UX stay inside Pi; Morph handles the merge step only
- **Dry-run support** — preview the unified diff and change stats before writing
- **Auth built in** — store your Morph key once with `/morph-login`; falls back to `MORPH_API_KEY` automatically

## Prerequisites

1. [Pi](https://github.com/badlogic/pi-mono) must be installed
2. A [Morph API key](https://morphllm.com)

## Installation

```bash
pi install npm:@victor-software-house/pi-fast-apply
```

## Quickstart

Store your Morph API key inside Pi:

```
/morph-login <your-api-key>
```

Then use `fast_apply` in any Pi session to edit an existing file:

```
path: src/utils/math.ts
instruction: I am adding input validation to the add function.
codeEdit:
  function add(a: number, b: number): number {
    if (typeof a !== 'number' || typeof b !== 'number') {
      throw new TypeError('Both arguments must be numbers.');
    }
    // ... existing code ...
  }
```

Morph merges the partial snippet into the real file. Pi writes the result with mutation-queue protection.

## Auth

Two configuration paths are supported:

| Method | How |
|:-------|:----|
| Pi auth storage (recommended) | `/morph-login <api-key>` — stored in `~/.pi/agent/auth.json` |
| Environment variable | `MORPH_API_KEY=<key>` — in your shell, `.env`, or a secret manager like fnox |

Pi auth storage is checked first. `MORPH_API_KEY` is used as a fallback.

`~/.pi/agent/auth.json` uses `0600` file permissions, consistent with how Pi stores keys for all providers. For stronger at-rest encryption, inject `MORPH_API_KEY` through fnox, age-encrypted secrets, or a system keychain instead.

### Commands

| Command | Description |
|:--------|:------------|
| `/morph-login <key>` | Store a Morph API key in Pi auth storage |
| `/morph-logout` | Remove stored Morph credentials |
| `/morph-status` | Show active auth source, API base URL, and timeout |

## Tool Contract

`fast_apply` uses Morph's semantic merge to apply partial edits to existing files.

**When to use `fast_apply`:**
- multiple scattered changes in one file
- complex refactors where `oldText` would be fragile or ambiguous
- whitespace-sensitive edits that exact replacement handles poorly
- **reorganizing a file whose lines contain huge or fragile values** (age ciphertexts, JWTs, base64 blobs, long URLs, multi-line embedded JSON) — use `// ... existing code ...` markers to keep every value byte-identical without retyping it

**When to use native tools instead:**
- small exact replacement → use `edit`
- creating a new file → use `write`
- `fast_apply` unavailable (no API key) → fall back to `edit`

### Placeholder pattern for huge values

Morph honors `// ... existing code ...` markers **anywhere a unique anchor exists**, including inline within a single line between two literal anchors. This is the right tool for reorganizing config files, secret stores, or large data tables where every right-hand side is a value you must never mistype.

Give every relocated line its own placeholder — one per row scales fine, there is no built-in limit:

```toml
[secrets]

# Bootstrap secrets.
ADMIN_TOKEN = // ... existing inline table for ADMIN_TOKEN ...
VPS_TOKEN   = // ... existing inline table for VPS_TOKEN ...

# Indeed corporate.
GITLAB_PAT      = // ... existing inline table ...
ATLASSIAN_TOKEN = // ... existing inline table ...
# ...one marker per relocated line, no value ever retyped...
```

Morph fills each placeholder from the existing file by matching the unique key anchor on the left. The huge values never enter the `codeEdit` argument.

Never paste a multi-KB value into `codeEdit` when a marker would work. Never fall back to a Python / Ruby / `sed` / `awk` rewrite script as a workaround for "too much to retype" — that is exactly the case the placeholder pattern was designed to cover.

If a needed line does not yet exist in the file, append it once with a single shell command (`cat >> file`, `echo >> file`) before calling `fast_apply`. Then every line in the `codeEdit` can be a placeholder.

Safety: Morph refuses to write output containing the literal marker syntax if the original file did not contain it. When *documenting* the pattern in markdown, use the `edit` tool with verbatim `oldText` / `newText` instead of `fast_apply`.

### Parameters

| Parameter | Description |
|:----------|:------------|
| `path` | Relative or absolute path to an existing file |
| `instruction` | First-person change description — e.g. `I am adding input validation to the add function.` |
| `codeEdit` | Partial edit containing only the changed sections, wrapped with `// ... existing code ...` markers. Include enough unique surrounding context to anchor each change precisely and preserve exact indentation. |
| `dryRun` | Preview the merge and diff without writing the file |

### Output

Each call returns a unified diff, the merged source, and a change summary (`+added -removed ~modified`).

## Configuration

| Variable | Default | Description |
|:---------|:--------|:------------|
| `MORPH_API_KEY` | — | Morph API key (fallback when Pi auth storage has no key) |
| `MORPH_API_URL` | `https://api.morphllm.com` | Override the Morph base URL |
| `MORPH_EDIT_TIMEOUT_MS` | `60000` | Request timeout in milliseconds |

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run lint
```

Autofix:

```bash
pnpm run fix
```

## License

MIT
