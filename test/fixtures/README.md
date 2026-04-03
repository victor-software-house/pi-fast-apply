# morph_edit Test Fixtures

Realistic source files for manual `morph_edit` testing. Each covers a distinct
scenario. They are **never part of the build** — `tsconfig.json` only includes
`extensions/**/*.ts`.

## Reset

```bash
# Copy all fixtures to /tmp/morph-test/ (wiping any in-place edits)
mise run test:reset

# Reset a single file
mise run test:reset ts/tiny.ts
```

## Fixtures

### `ts/auth-service.ts` — large class, JSDoc, private methods (370 lines)

Target scenarios:
- Edit a single method deep inside the class (`refresh` — add rate-limiting).
- Change a constant near the top (`ACCESS_TOKEN_TTL_MS` 15 min → 5 min).
- Verify that context above/below the change region is preserved exactly.

### `ts/api-client.ts` — scattered constants + classes (321 lines)

Target scenarios:
- **Scattered edit**: change `DEFAULT_TIMEOUT_MS`, add a field to `RequestOptions`,
  update `buildHeaders`, and change `CIRCUIT_BREAKER_THRESHOLD` — all in one call.
- Tests that morph handles four disjoint regions correctly without collateral damage.

### `ts/dashboard.tsx` — React component, JSX tree, hooks (327 lines)

Target scenarios:
- Edit inside a JSX tree (insert a component between siblings).
- Change a prop value on a nested component (`collapseBreakpoint="lg"` → `"md"`).
- Add an `onError` prop to a component call mid-tree.

### `ts/types.ts` — complex generics, discriminated unions (167 lines)

Target scenarios:
- Add a new utility type after an existing one.
- Extend a discriminated union with a new variant.
- Change a field in an interface that has downstream type users.

### `ts/tiny.ts` — 6 lines, no markers required

Target scenarios:
- Confirm morph works on files under the 10-line threshold **without** markers.
- Confirm that passing markers anyway still works.
- Test that a bad path produces a clear error, not a silent no-op.

### `ts/config.ts` — deeply nested config object, env helpers (175 lines)

Target scenarios:
- Change a nested default (`database.pool.max` 10 → 20).
- Add a new field inside a nested object (`database.pool.idleTimeoutMs`).
- Add a top-level property (`flags.enableBetaFeatures`).

### `py/pipeline.py` — Python with decorators, dataclasses, docstrings (413 lines)

Target scenarios:
- Add a decorator to a method (`@retry(max_attempts=3)` on `_fetch_batch`).
- Change a module-level constant (`DEFAULT_BATCH_SIZE` 100 → 500).
- Add a parameter to `__init__` and update the docstring of `run()`.

### `py/models.py` — dataclasses, validators, docstrings (295 lines)

Target scenarios:
- Add a field to a dataclass (`phone: str | None = None` in `UserProfile`).
- Add a validator classmethod for the new field.
- Change a max-length constant inside `__post_init__` (`bio` 500 → 280).
- Add a `tags` field to `Post` with a max-count validator.

### `md/architecture.md` — long markdown with headings, tables, code blocks (286 lines)

Target scenarios:
- Edit a section of prose without disturbing surrounding headings or code blocks.
- Update a value in a markdown table.
- Add a new ADR entry at the end of the Decision Log.

### `json/settings.json` — deep nested JSON config (92 lines)

Target scenarios:
- Change a nested numeric value (`database.pool.max` 10 → 20).
- Add a new key inside a nested object (`cache.ttl.user`).
- Test that morph preserves JSON formatting (indent, trailing newline).

---

## Verified Test Results (2026-04-03)

All tests run with fixtures copied to `/tmp/morph-test/` via `mise run test:reset`.
Session CWD was `~/.pi` (not `/tmp/morph-test`), so relative paths were not tested
from the fixture root — all fixture edits used absolute paths.

### Edit accuracy

| # | Scenario | Fixture | Lines | Regions | Result |
|:--|:---------|:--------|------:|--------:|:-------|
| 1 | Tiny file, no markers | `ts/tiny.ts` | 6 | 1 | ✔ exact ~1 line |
| 2 | Large file, single constant change | `ts/auth-service.ts` | 370 | 1 | ✔ exact ~1 line |
| 3 | 4 scattered regions in one call | `ts/api-client.ts` | 321 | 4 | ✔ +3 ~2 lines |
| 4 | JSX prop change inside tree | `ts/dashboard.tsx` | 327 | 1 | ✔ exact ~1 line |
| 5 | Python: decorator + constant | `py/pipeline.py` | 413 | 2 | ✔ +1 ~1 lines |
| 6 | Markdown: append ADR section | `md/architecture.md` | 286 | 1 | ✔ +12 lines |
| 7 | JSON: nested value + new key | `json/settings.json` | 92 | 2 | ✔ +1 ~2 lines |
| 8 | Dry run (no write to disk) | `ts/types.ts` | 167 | 1 | ✔ diff shown, file untouched |
| 9 | 4 disjoint nested config edits | `ts/config.ts` | 175 | 4 | ✔ +3 ~2 lines |

All edits were precise — no collateral damage to surrounding code, comments, or
whitespace. JSON trailing commas were handled correctly. Python indentation and
decorator placement were exact. JSX tree structure was preserved.

### Path resolution

| Path form | Example | Resolves correctly? | Notes |
|:----------|:--------|:--------------------|:------|
| Absolute | `/tmp/morph-test/ts/tiny.ts` | ✔ | |
| Relative | `ts/tiny.ts` | ✔ | resolved against `ctx.cwd` |
| Explicit `./` | `./ts/tiny.ts` | ✔ | same as bare relative |
| `@` prefix | `@ts/tiny.ts` | ✔ | `@` stripped before resolve |
| `~` (home) | `~/workspace/...` | ✘ | `resolve()` treats `~` as a literal directory name |
| Nonexistent file | `/tmp/morph-test/ts/no.ts` | ✔ error | clear "file not found" message |

### Bugs found and fixed

#### BUG-001: Error results rendered as success (fixed in `9406009`)

**Symptom:** When `morph_edit` threw an error (file not found, `~` path, etc.),
the operator-facing TUI showed a green `✔ morph_edit applied` with
`(no diff available)` — indistinguishable from success.

**Root cause:** `renderResult` never checked `context.isError`. When `execute`
throws, Pi calls `renderResult` with an empty `details` object and `context.isError = true`,
but the renderer unconditionally rendered the success path.

**Fix:** Added an early return in `renderResult` that checks `context.isError`
and renders `✘ morph_edit failed` in error colour with the actual error message.

#### BUG-002: `~` paths silently fail with misleading error (fixed in `9406009`)

**Symptom:** Passing `~/workspace/foo.ts` produced "Target file does not exist
or is not readable" — suggesting the file is missing, when the real problem is
that `~` is not expanded by Node.js `path.resolve()`.

**Root cause:** `resolve(ctx.cwd, '~/workspace/foo.ts')` produces
`/current/cwd/~/workspace/foo.ts` — a literal `~` directory that doesn't exist.
The old error message didn't mention this.

**Fix:** Added a `targetPath.startsWith('~')` check before the generic error,
with a specific message: "Path starts with '~' which is not expanded to the home
directory. Use an absolute path instead." The message also shows both the given
path and the resolved path so the operator can see what happened.

### Not yet tested

- Relative paths from a session whose CWD is `/tmp/morph-test` (would need to
  start a Pi session from that directory).
- `../` traversal paths.
- Very large files (1000+ lines).
- Concurrent morph_edit calls on the same file (queueing behaviour).
- Files with existing `// ... existing code ...` markers in their source.
- Binary or non-UTF-8 files (expected: error).
