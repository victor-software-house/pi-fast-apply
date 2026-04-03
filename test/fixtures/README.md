# morph_edit Test Fixtures

Realistic source files for manual `morph_edit` testing. Each covers a distinct
editing scenario. They are **never part of the build** — `tsconfig.json` only
includes `extensions/**/*.ts`.

## Reset

```bash
# Copy all fixtures to /tmp/morph-test/ (wiping any in-place edits)
mise run test:reset

# Reset a single file
mise run test:reset ts/tiny.ts
```

Never edit these source files during testing — always work on the `/tmp` copies.

## Fixtures

### `ts/auth-service.ts` — large class, JSDoc, private methods (370 lines)

- Edit a single method deep inside the class (`refresh` — add rate-limiting).
- Change a constant near the top (`ACCESS_TOKEN_TTL_MS` 15 min → 5 min).
- Verify that context above/below the change region is preserved exactly.

### `ts/api-client.ts` — scattered constants + classes (321 lines)

- **Scattered edit**: change `DEFAULT_TIMEOUT_MS`, add a field to `RequestOptions`,
  update `buildHeaders`, and change `CIRCUIT_BREAKER_THRESHOLD` — all in one call.
- Tests that morph handles four disjoint regions correctly without collateral damage.

### `ts/dashboard.tsx` — React component, JSX tree, hooks (327 lines)

- Edit inside a JSX tree (insert a component between siblings).
- Change a prop value on a nested component (`collapseBreakpoint="lg"` → `"md"`).
- Add an `onError` prop to a component call mid-tree.

### `ts/types.ts` — complex generics, discriminated unions (167 lines)

- Add a new utility type after an existing one.
- Extend a discriminated union with a new variant.
- Change a field in an interface that has downstream type users.

### `ts/tiny.ts` — 6 lines, no markers required

- Confirm morph works on files under the 10-line threshold **without** markers.
- Confirm that passing markers anyway still works.
- Test that a bad path produces a clear error, not a silent no-op.

### `ts/config.ts` — deeply nested config object, env helpers (175 lines)

- Change a nested default (`database.pool.max` 10 → 20).
- Add a new field inside a nested object (`database.pool.idleTimeoutMs`).
- Add a top-level property (`flags.enableBetaFeatures`).

### `py/pipeline.py` — Python with decorators, dataclasses, docstrings (413 lines)

- Add a decorator to a method (`@retry(max_attempts=3)` on `_fetch_batch`).
- Change a module-level constant (`DEFAULT_BATCH_SIZE` 100 → 500).
- Add a parameter to `__init__` and update the docstring of `run()`.

### `py/models.py` — dataclasses, validators, docstrings (295 lines)

- Add a field to a dataclass (`phone: str | None = None` in `UserProfile`).
- Add a validator classmethod for the new field.
- Change a max-length constant inside `__post_init__` (`bio` 500 → 280).
- Add a `tags` field to `Post` with a max-count validator.

### `md/architecture.md` — long markdown with headings, tables, code blocks (286 lines)

- Edit a section of prose without disturbing surrounding headings or code blocks.
- Update a value in a markdown table.
- Add a new ADR entry at the end of the Decision Log.

### `json/settings.json` — deep nested JSON config (92 lines)

- Change a nested numeric value (`database.pool.max` 10 → 20).
- Add a new key inside a nested object (`cache.ttl.user`).
- Test that morph preserves JSON formatting (indent, trailing newline).
