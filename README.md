# pi-morph

Morph integration package for [Pi](https://github.com/badlogic/pi-mono), starting with a Pi-native Fast Apply extension surface.

## Status

`pi-morph` now ships a Pi-native `morph_edit` tool backed by the official `@morphllm/morphsdk` Fast Apply API.

Implemented and verified in this repo:

- native `morph_edit` tool registration in [`extensions/index.ts`](extensions/index.ts)
- Pi-owned path resolution, file reads/writes, and `withFileMutationQueue()` protection
- dry-run support with preview details (`udiff`, `mergedCode`, change counts)
- real SDK-backed write path using `MORPH_API_KEY`
- manual validation against a temporary real file with both dry-run and real-write success

Not implemented yet:

- WarpGrep Pi-native tools
- Compact lifecycle integration
- richer custom TUI rendering beyond the default text result

## Intended package scope

`pi-morph` is intended to become the Pi-native home for Morph-backed capabilities such as:

- Fast Apply editing via a native `morph_edit` tool
- future WarpGrep local and GitHub search tools
- future Morph Compact lifecycle integration when Pi hook strategy is ready

The package should keep Pi in control of tool registration, path resolution, queueing, and user-facing UX instead of treating MCP as the primary native path.

## Package shape

```json
{
  "pi": {
    "extensions": ["./extensions"],
    "image": "https://raw.githubusercontent.com/victor-software-house/pi-morph/main/assets/preview.png"
  }
}
```

## Requirements

- `MORPH_API_KEY` must be available in the environment when using `morph_edit`
- optional: `MORPH_API_URL` to target a non-default Morph base URL
- optional: `MORPH_EDIT_TIMEOUT_MS` to override the default 60s timeout

## Tool contract

`morph_edit` is meant for **existing files** where exact string replacement would be brittle.

Parameters:

- `path` — relative or absolute path to an existing file
- `instruction` — first-person change description
- `codeEdit` — partial edit using `// ... existing code ...` markers
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
