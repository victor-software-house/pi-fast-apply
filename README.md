# pi-fast-apply

[Morph](https://www.morphllm.com/) tools for [Pi](https://github.com/earendil-works/pi). Registers `quick_edit` (Morph semantic merge), `codebase_search` (Morph WarpGrep), and Morph auth/config commands.

## Why

- **`quick_edit` is the default editor** — supply only changed sections with `// ... existing code ...` markers; Morph fills the unchanged parts. Multiple markers per line, single marker for entire nested objects, no limit.
- **`codebase_search`** — semantic local code search via WarpGrep. Finds implementations, traces flows, answers "where is X" questions in under 10 seconds.
- **Pi-native** — path resolution, mutation queueing, and rendering stay inside Pi. Morph handles semantic merge/search only.

## Prerequisites

1. [Pi](https://github.com/earendil-works/pi) installed
2. A [Morph API key](https://morphllm.com/dashboard/api-keys)

## Installation

```bash
pi install npm:@victor-software-house/pi-fast-apply
```

## Quickstart

```
/morph login <your-api-key>
```

Then use `quick_edit` as your default file editor:

```
path: src/api/users.ts
instruction: I am adding rate limiting to the createUser handler.
codeEdit:
  // ... existing code ...
  export async function createUser(req, res) {
    await rateLimiter.check(req.ip);
    // ... existing code ...
  }
```

Or search the codebase semantically before editing:

```
searchTerm: Find where authentication middleware is applied
```

## Tools

### `quick_edit` — default file editor

Morph semantic merge. Provide only changed sections; mark everything else `// ... existing code ...`.

**Always prefer over `edit`** unless the change is a single trivially unique string replacement.

**Marker patterns — use aggressively:**

```typescript
// Block: skip unchanged regions
function foo() {
  // ... existing code ...
  newLine();
  // ... existing code ...
}

// Inline: skip unchanged fields on same line (multiple per line)
{ host: 'new', port: // ... existing ..., ssl: // ... existing ..., pool: 20 }

// Inline: skip entire nested value
{ primary: { host: 'new', creds: // ... existing ... }, replica: // ... existing ... }

// Reorder without retyping: list new order, mark unchanged field values
const ROUTES = {
  api:  { path: // ... existing ..., auth: // ... existing ..., cache: // ... existing ... },
  docs: { path: // ... existing ..., auth: // ... existing ..., cache: 7200 },
  home: { path: // ... existing ..., auth: // ... existing ..., cache: // ... existing ... },
};
```

**Limit:** the marker string cannot appear as intended literal output — Morph treats any occurrence as an expansion instruction. Files that already contain it as real content are handled correctly.

**Creates new files directly** when the path does not exist (no API call, codeEdit written as-is).

| Parameter | Description |
|:--|:--|
| `path` | File path (relative or absolute) |
| `instruction` | First-person change description |
| `codeEdit` | Changed sections only + markers for everything else |

### `codebase_search` — semantic code search

WarpGrep multi-turn agentic search. Use for broad questions: "where is X implemented", "how does Y work", "what handles Z". Not for exact strings — use `grep`/`find` for those.

| Parameter | Description |
|:--|:--|
| `searchTerm` | Natural-language question |
| `repoRoot` | Workspace subdirectory to search (optional, defaults to workspace root) |
| `includes` | Ripgrep include globs e.g. `["src/**/*.ts"]` |
| `excludes` | Ripgrep exclude globs (replaces SDK defaults when set) |
| `searchType` | `default` or `node_modules` — auto-enabled when `repoRoot` is inside a `node_modules` path |

## Auth

| Method | How |
|:--|:--|
| Pi auth storage (recommended) | `/morph login <key>` — stored in Pi auth storage |
| Environment variable | `MORPH_API_KEY=<key>` |

Pi auth storage is checked first. `MORPH_API_KEY` is the fallback.

## Commands

| Command | Description |
|:--|:--|
| `/morph login <key>` | Store Morph API key in Pi auth storage |
| `/morph logout` | Remove stored credentials |
| `/morph status` | Show auth source, API URL, timeout, SDK patch status |
| `/morph probe` | Live diagnostics — checks auth, config, Compact API, and Fast Apply API |

## Configuration

| Variable | Default | Description |
|:--|:--|:--|
| `MORPH_API_KEY` | — | Morph API key (fallback when Pi auth has no key) |
| `MORPH_API_URL` | `https://api.morphllm.com` | Override API base URL (requires `MORPH_ALLOW_CUSTOM_API_URL=1` for non-default hosts) |
| `MORPH_EDIT_TIMEOUT_MS` | `60000` | Request timeout in ms |
| `MORPH_EDIT` | enabled | Set to `false` to disable `quick_edit` |
| `MORPH_WARPGREP` | enabled | Set to `false` to disable `codebase_search` |
| `CODEBASE_SEARCH_REDACTION` | enabled | Set to `0` to disable content redaction (for synthetic fixture debugging only) |

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Fix all auto-fixable issues:

```bash
pnpm run fix
```

Live tests (require `MORPH_API_KEY`):

```bash
# WarpGrep timing harness against a large public repo
CODEBASE_SEARCH_PUBLIC_REPO_ROOT=/path/to/repo \
MORPH_API_KEY="$(fnox get MORPH_API_KEY)" \
pnpm run measure:codebase-search -- "Find where authentication is implemented"

# quick_edit marker behavior — 7 complex scenarios × 3 runs each
MORPH_API_KEY="$(fnox get MORPH_API_KEY)" pnpm run test:quick-edit-live

# Refresh live test snapshots after a Morph model update
MORPH_API_KEY="$(fnox get MORPH_API_KEY)" pnpm run test:quick-edit-live -- --update-snapshots
```

## Specdocs

- [PRD-001: Morph Runtime Integration](docs/prd/PRD-001-morph-runtime-integration.md)
- [PRD-002: WarpGrep SDK Flexibility](docs/prd/PRD-002-warpgrep-sdk-flexibility.md)
- [PRD-003: Morph Config Pane and Auth](docs/prd/PRD-003-morph-config-pane-and-auth.md)
- [PRD-004: pi-components Public Package](docs/prd/PRD-004-pi-components-package.md)
- [Plan: Morph Runtime Integration](docs/architecture/plan-morph-runtime-integration.md)
- [Plan: WarpGrep SDK Flexibility](docs/architecture/plan-warpgrep-sdk-flexibility.md)

## License

MIT
