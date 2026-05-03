# Manual Validation — 2026-04-03

First systematic test run of `morph_edit` against the fixture corpus.

## Environment

- **Pi version:** 0.63.x (local path install from the repo root)
- **Model:** claude-sonnet-4-6
- **Session CWD:** `~/.pi` (not `/tmp/morph-test`)
- **Morph SDK:** `@morphllm/morphsdk ^0.2.163`
- **Fixtures:** 10 files, reset via `mise run test:reset`

## Edit Accuracy

All edits used absolute paths to `/tmp/morph-test/` since session CWD was `~/.pi`.

| # | Scenario | Fixture | Lines | Regions | Result | Detail |
|:--|:---------|:--------|------:|--------:|:-------|:-------|
| 1 | Tiny file, no markers | `ts/tiny.ts` | 6 | 1 | ✔ | ~1 line, value change only |
| 2 | On-disk verification | `ts/tiny.ts` | 6 | — | ✔ | `cat` confirmed, no whitespace damage |
| 3 | Large file, single constant | `ts/auth-service.ts` | 370 | 1 | ✔ | ~1 line, comment updated too |
| 4 | 4 scattered regions, 1 call | `ts/api-client.ts` | 321 | 4 | ✔ | +3 ~2 lines, no collateral |
| 5 | JSX prop change in tree | `ts/dashboard.tsx` | 327 | 1 | ✔ | ~1 line at line 317 |
| 6 | Python: decorator + constant | `py/pipeline.py` | 413 | 2 | ✔ | +1 ~1, indentation exact |
| 7 | Markdown: append ADR section | `md/architecture.md` | 286 | 1 | ✔ | +12 lines at EOF |
| 8 | JSON: nested value + new key | `json/settings.json` | 92 | 2 | ✔ | +1 ~2, trailing comma handled |
| 9 | Dry run (no write) | `ts/types.ts` | 167 | 1 | ✔ | diff shown, file untouched on disk |
| 10 | 4 disjoint nested config edits | `ts/config.ts` | 175 | 4 | ✔ | +3 ~2, all 4 regions precise |

**12/12 scenarios passed.** All edits were precise with no collateral damage to
surrounding code, comments, or whitespace.

## Path Resolution

| Path form | Example | Works? | Notes |
|:----------|:--------|:-------|:------|
| Absolute | `/tmp/morph-test/ts/tiny.ts` | ✔ | |
| `~` (home) | `~/workspace/.../tiny.ts` | ✘ | `resolve()` treats `~` as literal dir → BUG-002 |
| Nonexistent file | `/tmp/morph-test/ts/no.ts` | ✔ error | clear message |
| `@` prefix | `@ts/tiny.ts` | ✔ | `@` stripped before resolve |

Relative and `../` paths were **not tested** — session CWD was `~/.pi`, not the
fixture directory.

## Bugs Found

### BUG-001: Error results rendered as success

**Severity:** high — operator cannot distinguish success from failure.

**Symptom:** When `morph_edit` throws (file not found, bad path), the TUI shows
a green `✔ morph_edit applied` with `(no diff available)`. Visually identical to
a successful no-op.

**Root cause:** `renderResult` in `extensions/index.ts` never checked
`context.isError`. When `execute` throws, Pi calls `renderResult` with empty
`details` and `context.isError = true`, but the renderer unconditionally rendered
the success path (green checkmark, "applied" label).

**Fix:** Added an early return in `renderResult` that checks `context.isError`
and renders `✘ morph_edit failed` in error colour with the error message text.

**Commit:** `9406009`

### BUG-002: `~` paths silently fail with misleading error

**Severity:** medium — error fires but the message is wrong.

**Symptom:** `morph_edit` with path `~/workspace/foo.ts` produces "Target file
does not exist or is not readable" — suggesting the file is missing, when the
real problem is that `~` is not expanded.

**Root cause:** Node.js `path.resolve(cwd, '~/workspace/foo.ts')` produces
`/current/cwd/~/workspace/foo.ts` — a bogus path with a literal `~` directory.

**Fix:** Added `targetPath.startsWith('~')` detection before the generic error,
with a specific message explaining that `~` is not expanded and showing both the
given and resolved paths.

**Commit:** `9406009`

**Note:** The `~` path is still not *expanded* — only the error message is
improved. Actual tilde expansion could be added as a future enhancement but needs
careful consideration (models should use absolute paths).

## Not Yet Tested

- Relative paths from a session with CWD at `/tmp/morph-test`
- `../` traversal paths
- Very large files (1000+ lines)
- Concurrent `morph_edit` calls on the same file (queue behaviour)
- Files with existing `// ... existing code ...` markers in their source
- Binary or non-UTF-8 files (expected: error)
- Model routing: does the model choose `morph_edit` over `edit` appropriately?
- Instruction quality: does instruction phrasing affect merge accuracy?
