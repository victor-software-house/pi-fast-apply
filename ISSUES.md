# Issues

Active defects with exact symptoms and verification criteria.

## Active

### BUG-003: No real streaming in `fast_apply` — only final result delivered

**Found:** 2026-04-08

Morph SDK returns steps during apply, and streaming is planned and claimed in
documentation, but the extension delivers the result all at once. Operators see
nothing until the full apply completes; there is no incremental output.

**Acceptance:** Morph step events surface progressively in the Pi tool output
as the apply runs, not only at completion.

---

### BUG-004: No deduplication in `codebase_search` results

**Found:** 2026-04-08

The same file can appear in multiple search results within the same session.
Whether deduplication should be applied per-call, per-session, or not at all
is an open design question.

**Acceptance:** A decision is made and documented. If deduplication is enabled,
the same file path is not surfaced more than once for a given scope (call or
session). If intentionally omitted, the rationale is recorded.

---

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
