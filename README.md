# pi-morph

Morph integration package for [Pi](https://github.com/badlogic/pi-mono), starting with a Pi-native Fast Apply extension surface.

## Status

Scaffold-first repository. The package shape, release flow, lint gates, and extension entrypoint are in place, but the runtime implementation is still a stub.

Do not describe roadmap items as implemented until they exist in committed source.

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
