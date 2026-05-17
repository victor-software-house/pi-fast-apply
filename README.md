# pi-fast-apply

[Morph](https://www.morphllm.com/) tools for [Pi](https://github.com/earendil-works/pi). Native `fast_apply` edits existing files using partial code snippets and semantic merging — no exact `oldText` matching required. Native `codebase_search` uses Morph WarpGrep for semantic local code search.

## Why

- **Handles scattered changes** — multiple disjoint edits in one file, one call, no fragile string anchors
- **Semantic merging** — Morph resolves partial snippets against the real file; the model provides only what changed
- **Pi-native** — path resolution, mutation queueing, search bounds, and UX stay inside Pi; Morph handles semantic merge/search only
- **Dry-run support** — preview the unified diff and change stats before writing
- **Auth built in** — store your Morph key once with `/morph-login`; falls back to `MORPH_API_KEY` automatically

## Prerequisites

1. [Pi](https://github.com/earendil-works/pi) must be installed
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

Use `codebase_search` when you need semantic local code discovery before editing:

```
searchTerm: Find where Morph auth and runtime config are resolved
```

WarpGrep searches in its own Morph context and returns bounded file:line/code context to Pi.

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
| `/morph-status` | Show active auth source, API base URL, timeout, SDK version, and SDK auto-default patch status |
| `/morph-probe` | Run Morph runtime diagnostics. Reports SDK auto-default patch status, checks config/auth locally, then performs live Compact and Fast Apply API calls when an API key is configured. Does not read or write project files. |

## Tool Contract

This package registers two Morph-backed tools: `fast_apply` and `codebase_search`.

### `fast_apply`

`fast_apply` uses Morph's semantic merge to apply partial edits to existing files.

**When to use `fast_apply`:**
- multiple scattered changes in one workspace file
- complex refactors where `oldText` would be fragile or ambiguous
- whitespace-sensitive edits that exact replacement handles poorly
- reorganizing a file whose lines contain huge or fragile values — use `// ... existing code ...` markers to keep every value byte-identical without retyping it

**When to use native tools instead:**
- small exact replacement → use `edit`
- sensitive files → use `edit`
- creating a new file → use `write`
- `fast_apply` unavailable (no API key) → fall back to `edit`

### Placeholder pattern for huge values

Morph honors `// ... existing code ...` markers **anywhere a unique anchor exists**, including inline within a single line between two literal anchors. This is the right tool for reorganizing config files or large data tables where every right-hand side is a value you must never mistype.

Give every relocated line its own placeholder — one per row scales fine, there is no built-in limit:

```toml
[fixtures]

# Bootstrap public fixtures.
PUBLIC_FIXTURE_A = // ... existing inline table for PUBLIC_FIXTURE_A ...
PUBLIC_FIXTURE_B = // ... existing inline table for PUBLIC_FIXTURE_B ...

# Non-secret test data.
SAMPLE_PAYLOAD_A = // ... existing inline table ...
SAMPLE_PAYLOAD_B = // ... existing inline table ...
# ...one marker per relocated line, no value ever retyped...
```

Morph fills each placeholder from the existing file by matching the unique key anchor on the left. The huge values never enter the `codeEdit` argument.

Never paste a multi-KB value into `codeEdit` when a marker would work. Never fall back to a Python / Ruby / `sed` / `awk` rewrite script as a workaround for "too much to retype" — that is exactly the case the placeholder pattern was designed to cover.

If a needed line does not yet exist in the file, append it once with a single shell command (`cat >> file`, `echo >> file`) before calling `fast_apply`. Then every line in the `codeEdit` can be a placeholder.

Safety: Morph refuses to write output containing the literal marker syntax if the original file did not contain it. `fast_apply` also refuses workspace escapes, symlink escapes, and obvious secret filenames. When *documenting* the pattern in markdown, use the `edit` tool with verbatim `oldText` / `newText` instead of `fast_apply`.

### `fast_apply` parameters

| Parameter | Description |
|:----------|:------------|
| `path` | Relative or absolute path to an existing file |
| `instruction` | First-person change description — e.g. `I am adding input validation to the add function.` |
| `codeEdit` | Partial edit containing only the changed sections, wrapped with `// ... existing code ...` markers. Include enough unique surrounding context to anchor each change precisely and preserve exact indentation. |
| `dryRun` | Preview the merge and diff without writing the file |

### `fast_apply` output

Each call returns a unified diff, the merged source, and a change summary (`+added -removed ~modified`). Fast Apply uses the patched SDK default `auto` route and does not expose model/large controls.

### `codebase_search`

`codebase_search` uses Morph WarpGrep to semantically search code inside the current Pi workspace. Use it for broad discovery questions, architecture exploration, and finding implementation context before edits.

Use native tools instead for exact lookups:

- exact string or regex search → `grep`
- filename/path lookup → `find`
- known sensitive files requiring exact inspection → local-only tools, not Morph-backed tools

### `codebase_search` parameters

| Parameter | Description |
|:----------|:------------|
| `searchTerm` | Natural-language question about where code behavior lives in the local codebase |
| `repoRoot` | Optional local directory inside the current workspace to search; defaults to current workspace |

### `codebase_search` output

Each call returns bounded relevant file contexts with line ranges. Intermediate WarpGrep search steps stay inside Morph's search context and are shown to the operator as progress updates when Pi can render them.

Data flow: Pi rejects secret-like search terms, executes local search/read operations under the selected workspace directory, redacts detected secrets with Secretlint, omits content from high-risk secret container paths, sends sanitized WarpGrep tool context to Morph, then returns selected file:line/code context. Search-term detection uses TruffleHog-derived `@sanity-labs/secret-scan` as a lightweight preflight. `codebase_search` keeps WarpGrep's default discovery behavior; path-only listing/glob output is not blocked.

## Configuration

| Variable | Default | Description |
|:---------|:--------|:------------|
| `MORPH_API_KEY` | — | Morph API key (fallback when Pi auth storage has no key) |
| `MORPH_API_URL` | `https://api.morphllm.com` | Override the Morph base URL. Must use `https`, cannot include embedded credentials, query strings, or fragments, and custom hosts require `MORPH_ALLOW_CUSTOM_API_URL=1`. |
| `MORPH_ALLOW_CUSTOM_API_URL` | — | Opt in to trusted non-default Morph API hosts for testing. |
| `MORPH_EDIT_TIMEOUT_MS` | `60000` | Morph request timeout in milliseconds for Fast Apply and local Codebase Search |

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
