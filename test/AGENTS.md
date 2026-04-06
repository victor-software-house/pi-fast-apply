# test/

Testing subtree for `pi-fast-apply`. Contains fixture files, test reports, and
(eventually) automated test infrastructure.

## Subtree layout

- [`fixtures/`](fixtures/) — source files for manual and automated `morph_edit` testing.
  Each file targets a specific editing scenario (scattered edits, JSX, Python, JSON, etc.).
  Reset to `/tmp/morph-test/` via `mise run test:reset`. See [`fixtures/README.md`](fixtures/README.md).

- [`reports/`](reports/) — dated test run reports. Each report captures the scenarios
  exercised, pass/fail results, bugs found, and environment notes. One file per test run.

## Running tests

```bash
# Reset fixtures to /tmp/morph-test/ (wipes previous edits)
mise run test:reset

# Reset a single fixture
mise run test:reset ts/tiny.ts
```

Then exercise `morph_edit` against `/tmp/morph-test/` files. Never edit fixture
source files in `test/fixtures/` during testing — always work on the `/tmp` copies.

## Adding a report

Create `reports/YYYY-MM-DD-<slug>.md` after each test run. Include:

1. Environment (model, Pi version, session CWD)
2. Scenarios tested (table with fixture, description, result)
3. Bugs found (with symptom, root cause, fix reference or open issue ID)
4. Not-yet-tested items surfaced during the run

Link new bugs to [`ISSUES.md`](../ISSUES.md) at the repo root.

## Build exclusion

Test files are excluded from the package build:

- `tsconfig.json` only includes `extensions/**/*.ts`
- `biome.json` only includes `extensions/**`
- `.oxlintrc.json` ignores `test/**`
- `package.json` `files` field only ships `extensions`, `assets/**`, `README.md`, `LICENSE`
