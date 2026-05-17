# Morph Apply Matrix — 2026-05-16

Repeated live validation of Morph Apply request paths after embedding the `@morphllm/morphsdk@0.2.171` pnpm patch.

## Environment

- **Session CWD:** repo root
- **API key:** `MORPH_API_KEY` environment variable, populated from fnox outside the script; value not printed
- **SDK:** `@morphllm/morphsdk@0.2.171` with repo patch `patches/@morphllm__morphsdk@0.2.171.patch`
- **Runner:** `test/morph-apply-matrix.test.ts` (Vitest)
- **Command:** `mise run test:morph-matrix` or `MORPH_API_KEY="$(fnox get MORPH_API_KEY)" pnpm run test:morph-matrix`
- **Runs:** 10 scenarios × 10 request paths × 3 repetitions = 300 live calls

## Result

**300/300 calls passed.** No scenario produced divergent normalized output hashes across request paths or repeated runs.

## Outputs

- Matrix summary: [`docs/morph-apply-behavior-matrix.md`](../../docs/morph-apply-behavior-matrix.md)
- Scenario inputs: [`docs/morph-apply-scenarios.md`](../../docs/morph-apply-scenarios.md)

## Request Paths

| Path | Model sent / implied | Result |
|:--|:--|:--|
| Patched SDK default omitted | `auto` | 30/30 pass |
| SDK `large=false` | `morph-v3-fast` | 30/30 pass |
| SDK `large=true` | `morph-v3-large` | 30/30 pass |
| Raw chat fast | `morph-v3-fast` | 30/30 pass |
| Raw chat large | `morph-v3-large` | 30/30 pass |
| Raw chat auto | `auto` | 30/30 pass |
| Code Apply default | `auto` default | 30/30 pass |
| Code Apply fast | `morph-v3-fast` | 30/30 pass |
| Code Apply large | `morph-v3-large` | 30/30 pass |
| Code Apply auto | `auto` | 30/30 pass |

## Notes

- Published SDK does not expose `auto`.
- Repo patch adds `model?: 'auto' | 'morph-v3-fast' | 'morph-v3-large'` and makes omitted model selection resolve to `auto`.
- Legacy SDK `large` flag remains compatible.
- `fast_apply` should expose no model selector; patched SDK owns `auto` default.
