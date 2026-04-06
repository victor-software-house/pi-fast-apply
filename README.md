# pi-fast-apply

Morph integration package for [Pi](https://github.com/badlogic/pi-mono), starting with a Pi-native Fast Apply extension surface.

## Status

`pi-fast-apply` now ships a Pi-native `fast_apply` tool backed by the official `@morphllm/morphsdk` Fast Apply API.

Implemented and verified in this repo:

- native `fast_apply` tool registration in [`extensions/index.ts`](extensions/index.ts)
- Pi-owned path resolution, file reads/writes, and `withFileMutationQueue()` protection
- dry-run support with preview details (`udiff`, `mergedCode`, change counts)
- real SDK-backed write path using Morph API key
- Pi-native auth management with `/morph-login`, `/morph-logout`, and `/morph-status` commands
- manual validation against a temporary real file with both dry-run and real-write success

Not implemented yet:

- WarpGrep Pi-native tools
- Compact lifecycle integration
- richer custom TUI rendering beyond the default text result

## Intended package scope

`pi-fast-apply` is intended to become the Pi-native home for Morph-backed capabilities such as:

- Fast Apply editing via a native `fast_apply` tool
- future WarpGrep local and GitHub search tools
- future Morph Compact lifecycle integration when Pi hook strategy is ready

The package should keep Pi in control of tool registration, path resolution, queueing, and user-facing UX instead of treating MCP as the primary native path.

## Package shape

```json
{
  "pi": {
    "extensions": ["./extensions"],
    "image": "https://raw.githubusercontent.com/victor-software-house/pi-fast-apply/main/assets/preview.png"
  }
}
```

## Requirements

A Morph API key is required to use `fast_apply`. Two configuration paths are supported:

1. **Pi auth storage** (recommended) — run `/morph-login <api-key>` inside Pi to store the key in `~/.pi/agent/auth.json`
2. **Environment variable** — set `MORPH_API_KEY` in the shell, `.env`, or via a secret manager like fnox

Resolution priority: Pi auth storage is checked first. If no key is found there, the `MORPH_API_KEY` environment variable is used as a fallback.

### Auth commands

| Command | Description |
|:--------|:------------|
| `/morph-login <key>` | Store a Morph API key in Pi auth storage |
| `/morph-logout` | Remove stored Morph credentials from Pi auth storage |
| `/morph-status` | Show current auth source, API base URL, and timeout |

### Additional environment variables

- `MORPH_API_URL` — override the default Morph base URL (`https://api.morphllm.com`)
- `MORPH_EDIT_TIMEOUT_MS` — override the default 60s timeout

### Auth security trade-offs

Pi's `auth.json` is stored with `0600` file permissions and uses file locking for safe concurrent access. This is consistent with how Pi stores credentials for all providers (Anthropic, OpenAI, etc.). For stronger at-rest encryption, environment-variable injection through fnox, age-encrypted secrets, or a system keychain remains a valid alternative — use `MORPH_API_KEY` via your preferred secret manager instead of `/morph-login`.

## Tool contract

`fast_apply` uses Morph's semantic merge to edit existing files using partial code snippets. It is designed for multiple scattered changes in one file, complex refactors, or edits where exact `oldText` matching would be fragile.

**Routing Guidance:**
- Use `fast_apply` for scattered or fragile edits in existing files.
- Use native `edit` for small exact replacements.
- Use native `write` for new files.

Parameters:

- `path` — relative or absolute path to an existing file
- `instruction` — first-person change description (e.g. "I am adding input validation to the add function.")
- `codeEdit` — partial edit containing only the changed sections, wrapped with `// ... existing code ...` markers instead of rewriting the whole file. Include enough unique surrounding context to anchor each change precisely.
- `dryRun` — preview without writing the file

Behavior:

- refuses to create new files; use Pi's `write` tool for that
- requires marker-based partial edits for non-trivial existing files
- keeps file I/O inside Pi and uses Morph only for the semantic merge step
- returns `udiff`, merged output, and change stats in tool details

## Validation snapshot

Manual package-level validation was run against the real Morph service on a temporary `math.ts` file.

Verified outcomes:

- dry run succeeded without changing the file
- real write succeeded and updated the file
- SDK returned change stats and unified diff output
- registered command surface includes `morph-status`

Observed sample change summary from validation:

- `+3 -0 ~0`

## Development

```bash
bun install
bun run typecheck
bun run lint
```

Autofix:

```bash
bun run fix
```

Formatting only:

```bash
bun run format
```

## License

MIT
