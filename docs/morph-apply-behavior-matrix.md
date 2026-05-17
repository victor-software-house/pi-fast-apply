# Morph Apply Behavior Matrix

Generated: 2026-05-16 22:28:09 BRT.

API key source: fnox secret name `MORPH_API_KEY`; value not printed. Requests ran sequentially from the repo root. Timings are wall-clock milliseconds measured around each API/SDK call.

## Direct answer

* SDK does **not** expose `auto`.
* SDK always sends a concrete model to `/v1/chat/completions`.
* SDK `large` omitted resolves to `morph-v3-large`, then sends that model.
* SDK `large: false` sends `morph-v3-fast`.
* SDK `large: true` sends `morph-v3-large`.
* Raw Chat and Code Apply both accept `auto` in live tests.

## Request paths tested

| Path | Model sent / implied | Notes |
|:--|:--|:--|
| SDK default omitted | `morph-v3-large` | sdk-default-omitted |
| SDK large=false | `morph-v3-fast` | sdk-fast-large-false |
| SDK large=true | `morph-v3-large` | sdk-large-true |
| Raw chat fast | `morph-v3-fast` | raw-chat-fast |
| Raw chat large | `morph-v3-large` | raw-chat-large |
| Raw chat auto | `auto` | raw-chat-auto |
| Code Apply default | `auto default` | code-apply-default-auto |
| Code Apply fast | `morph-v3-fast` | code-apply-fast |
| Code Apply large | `morph-v3-large` | code-apply-large |
| Code Apply auto | `auto` | code-apply-auto |

## Aggregate results

Total: 100; failed: 0.

| Transport | Pass | Avg ms | Min ms | Max ms |
|:--|--:|--:|--:|--:|
| SDK default omitted | 10/10 | 613 | 419 | 852 |
| SDK large=false | 10/10 | 422 | 357 | 556 |
| SDK large=true | 10/10 | 843 | 424 | 4302 |
| Raw chat fast | 10/10 | 446 | 360 | 677 |
| Raw chat large | 10/10 | 511 | 430 | 651 |
| Raw chat auto | 10/10 | 458 | 390 | 504 |
| Code Apply default | 10/10 | 413 | 360 | 594 |
| Code Apply fast | 10/10 | 384 | 359 | 484 |
| Code Apply large | 10/10 | 370 | 360 | 386 |
| Code Apply auto | 10/10 | 378 | 358 | 442 |

## Per-scenario comparison

### S01: Small JS validation

Instruction: I am adding number validation to the add function.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 852 | `6dc5d7ed07d2` |  |
| SDK large=false | ✔ | 556 | `6dc5d7ed07d2` |  |
| SDK large=true | ✔ | 445 | `6dc5d7ed07d2` |  |
| Raw chat fast | ✔ | 677 | `6dc5d7ed07d2` |  |
| Raw chat large | ✔ | 600 | `6dc5d7ed07d2` |  |
| Raw chat auto | ✔ | 463 | `6dc5d7ed07d2` |  |
| Code Apply default | ✔ | 367 | `6dc5d7ed07d2` |  |
| Code Apply fast | ✔ | 363 | `6dc5d7ed07d2` |  |
| Code Apply large | ✔ | 362 | `6dc5d7ed07d2` |  |
| Code Apply auto | ✔ | 361 | `6dc5d7ed07d2` |  |

Representative merged output:

```ts
function add(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new TypeError('Expected numbers');
  }
  return a + b;
}

```

### S02: Multi-hunk TypeScript import + options + body

Instruction: I am adding logger support and retry configuration to fetchUser.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 419 | `2363b08eb289` |  |
| SDK large=false | ✔ | 357 | `2363b08eb289` |  |
| SDK large=true | ✔ | 424 | `2363b08eb289` |  |
| Raw chat fast | ✔ | 367 | `2363b08eb289` |  |
| Raw chat large | ✔ | 430 | `2363b08eb289` |  |
| Raw chat auto | ✔ | 430 | `2363b08eb289` |  |
| Code Apply default | ✔ | 508 | `2363b08eb289` |  |
| Code Apply fast | ✔ | 370 | `2363b08eb289` |  |
| Code Apply large | ✔ | 371 | `2363b08eb289` |  |
| Code Apply auto | ✔ | 370 | `2363b08eb289` |  |

Representative merged output:

```ts
import { request } from './http';
import { logger } from './logger';

interface FetchUserOptions {
  includePosts?: boolean;
  retries?: number;
}

export async function fetchUser(id: string, options: FetchUserOptions = {}) {
  logger.info('fetching user', { id });
  const response = await request('/users/' + id, {
    query: { includePosts: options.includePosts ?? false },
    retries: options.retries ?? 2,
  });

  return response.json();
}

```

### S03: Delete helper and update caller

Instruction: I am removing the legacyNormalize helper and using normalizeName directly.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 652 | `a783fdc485e0` |  |
| SDK large=false | ✔ | 475 | `a783fdc485e0` |  |
| SDK large=true | ✔ | 462 | `a783fdc485e0` |  |
| Raw chat fast | ✔ | 376 | `a783fdc485e0` |  |
| Raw chat large | ✔ | 477 | `a783fdc485e0` |  |
| Raw chat auto | ✔ | 472 | `a783fdc485e0` |  |
| Code Apply default | ✔ | 371 | `a783fdc485e0` |  |
| Code Apply fast | ✔ | 370 | `a783fdc485e0` |  |
| Code Apply large | ✔ | 371 | `a783fdc485e0` |  |
| Code Apply auto | ✔ | 370 | `a783fdc485e0` |  |

Representative merged output:

```ts
function normalizeName(value) {
  return value.trim().toLowerCase();
}

export function buildSlug(input) {
  return normalizeName(input);
}

```

### S04: Long-value preservation with placeholder

Instruction: I am adding a request timeout setting while preserving existing secret-like values.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 602 | `a20a42edb579` |  |
| SDK large=false | ✔ | 374 | `a20a42edb579` |  |
| SDK large=true | ✔ | 472 | `a20a42edb579` |  |
| Raw chat fast | ✔ | 387 | `a20a42edb579` |  |
| Raw chat large | ✔ | 477 | `a20a42edb579` |  |
| Raw chat auto | ✔ | 390 | `a20a42edb579` |  |
| Code Apply default | ✔ | 383 | `a20a42edb579` |  |
| Code Apply fast | ✔ | 383 | `a20a42edb579` |  |
| Code Apply large | ✔ | 386 | `a20a42edb579` |  |
| Code Apply auto | ✔ | 382 | `a20a42edb579` |  |

Representative merged output:

```ts
export const settings = {
  encryptedToken: 'age1testvalue_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_end',
  encodedPayload: 'base64_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB_end',
  retries: 2,
  requestTimeoutMs: 30000,
};

```

### S05: Duplicate context disambiguation

Instruction: I am enabling audit logging only for the admin route.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 585 | `bd51698c7e68` |  |
| SDK large=false | ✔ | 495 | `bd51698c7e68` |  |
| SDK large=true | ✔ | 463 | `bd51698c7e68` |  |
| Raw chat fast | ✔ | 491 | `bd51698c7e68` |  |
| Raw chat large | ✔ | 473 | `bd51698c7e68` |  |
| Raw chat auto | ✔ | 477 | `bd51698c7e68` |  |
| Code Apply default | ✔ | 364 | `bd51698c7e68` |  |
| Code Apply fast | ✔ | 379 | `bd51698c7e68` |  |
| Code Apply large | ✔ | 379 | `bd51698c7e68` |  |
| Code Apply auto | ✔ | 363 | `bd51698c7e68` |  |

Representative merged output:

```ts
export const publicRoute = {
  path: '/public',
  audit: false,
  handler: handlePublic,
};

export const adminRoute = {
  path: '/admin',
  audit: true,
  handler: handleAdmin,
};

```

### S06: Python error handling

Instruction: I am adding explicit FileNotFoundError handling to load_config.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 586 | `b2b05319f18e` |  |
| SDK large=false | ✔ | 370 | `b2b05319f18e` |  |
| SDK large=true | ✔ | 455 | `b2b05319f18e` |  |
| Raw chat fast | ✔ | 360 | `b2b05319f18e` |  |
| Raw chat large | ✔ | 454 | `b2b05319f18e` |  |
| Raw chat auto | ✔ | 458 | `b2b05319f18e` |  |
| Code Apply default | ✔ | 594 | `b2b05319f18e` |  |
| Code Apply fast | ✔ | 379 | `b2b05319f18e` |  |
| Code Apply large | ✔ | 361 | `b2b05319f18e` |  |
| Code Apply auto | ✔ | 414 | `b2b05319f18e` |  |

Representative merged output:

```python
import json

def load_config(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except FileNotFoundError as exc:
        raise RuntimeError(f'Config not found: {path}') from exc

```

### S07: Markdown section insertion

Instruction: I am adding a troubleshooting section after installation.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 668 | `3ac3b8b8097b` |  |
| SDK large=false | ✔ | 501 | `3ac3b8b8097b` |  |
| SDK large=true | ✔ | 472 | `3ac3b8b8097b` |  |
| Raw chat fast | ✔ | 383 | `3ac3b8b8097b` |  |
| Raw chat large | ✔ | 595 | `3ac3b8b8097b` |  |
| Raw chat auto | ✔ | 468 | `3ac3b8b8097b` |  |
| Code Apply default | ✔ | 430 | `3ac3b8b8097b` |  |
| Code Apply fast | ✔ | 484 | `3ac3b8b8097b` |  |
| Code Apply large | ✔ | 366 | `3ac3b8b8097b` |  |
| Code Apply auto | ✔ | 364 | `3ac3b8b8097b` |  |

Representative merged output:

```markdown
# Tool

## Install

Run pnpm install.

## Troubleshooting

If install fails, run pnpm install --force and retry.

## Usage

Run pnpm dev.

```

### S08: CSS duplicate selector target

Instruction: I am increasing only the primary button font weight.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 649 | `fbe125fb4475` |  |
| SDK large=false | ✔ | 378 | `fbe125fb4475` |  |
| SDK large=true | ✔ | 494 | `fbe125fb4475` |  |
| Raw chat fast | ✔ | 387 | `fbe125fb4475` |  |
| Raw chat large | ✔ | 507 | `fbe125fb4475` |  |
| Raw chat auto | ✔ | 504 | `fbe125fb4475` |  |
| Code Apply default | ✔ | 387 | `fbe125fb4475` |  |
| Code Apply fast | ✔ | 389 | `fbe125fb4475` |  |
| Code Apply large | ✔ | 382 | `fbe125fb4475` |  |
| Code Apply auto | ✔ | 442 | `fbe125fb4475` |  |

Representative merged output:

```css
.button {
  border-radius: 4px;
  font-weight: 400;
}

.button.primary {
  background: blue;
  font-weight: 700;
}

.button.secondary {
  background: gray;
  font-weight: 500;
}

```

### S09: Nested config object edit

Instruction: I am enabling metrics while preserving existing service config.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 574 | `da8daadc9db7` |  |
| SDK large=false | ✔ | 357 | `da8daadc9db7` |  |
| SDK large=true | ✔ | 443 | `da8daadc9db7` |  |
| Raw chat fast | ✔ | 470 | `da8daadc9db7` |  |
| Raw chat large | ✔ | 442 | `da8daadc9db7` |  |
| Raw chat auto | ✔ | 437 | `da8daadc9db7` |  |
| Code Apply default | ✔ | 360 | `da8daadc9db7` |  |
| Code Apply fast | ✔ | 359 | `da8daadc9db7` |  |
| Code Apply large | ✔ | 360 | `da8daadc9db7` |  |
| Code Apply auto | ✔ | 358 | `da8daadc9db7` |  |

Representative merged output:

```ts
export const config = {
  service: {
    host: 'localhost',
    port: 3000,
  },
  metrics: {
    enabled: true,
    sampleRate: 0.25,
  },
};

```

### S10: Java class method addition

Instruction: I am adding a disabled-account check before returning access.

Result groups: 1 unique normalized output hash.

| Transport | Pass | ms | Hash | Failed checks |
|:--|:--:|--:|:--|:--|
| SDK default omitted | ✔ | 547 | `8328d916b2d0` |  |
| SDK large=false | ✔ | 357 | `8328d916b2d0` |  |
| SDK large=true | ✔ | 4302 | `8328d916b2d0` |  |
| Raw chat fast | ✔ | 565 | `8328d916b2d0` |  |
| Raw chat large | ✔ | 651 | `8328d916b2d0` |  |
| Raw chat auto | ✔ | 479 | `8328d916b2d0` |  |
| Code Apply default | ✔ | 363 | `8328d916b2d0` |  |
| Code Apply fast | ✔ | 361 | `8328d916b2d0` |  |
| Code Apply large | ✔ | 361 | `8328d916b2d0` |  |
| Code Apply auto | ✔ | 359 | `8328d916b2d0` |  |

Representative merged output:

```java
public class AccessPolicy {
    public boolean canAccess(User user) {
        if (user == null) {
            return false;
        }
        if (user.isDisabled()) {
            return false;
        }
        return user.hasRole("admin");
    }
}

```

