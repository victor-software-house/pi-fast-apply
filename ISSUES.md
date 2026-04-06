# Issues

Active defects with exact symptoms and verification criteria.

## Resolved

### BUG-001: Error results rendered as success ✔

**Found:** 2026-04-03 — [`test/reports/2026-04-03-manual-validation.md`](test/reports/2026-04-03-manual-validation.md)
**Fixed:** `9406009`

`renderResult` showed green `✔ fast_apply applied` on errors because it never
checked `context.isError`. Now shows `✘ fast_apply failed` with the error text.

### BUG-002: `~` paths silently fail with misleading error ✔

**Found:** 2026-04-03 — [`test/reports/2026-04-03-manual-validation.md`](test/reports/2026-04-03-manual-validation.md)
**Fixed:** `9406009`

`resolve(cwd, '~/foo')` produces a bogus literal-`~` path. Error message now
detects `~` and explains it is not expanded, showing both given and resolved paths.

`~` is still not actually expanded — only the error is clearer. Tilde expansion
is a potential enhancement but models should use absolute paths.
