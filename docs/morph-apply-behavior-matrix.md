# Morph Apply Behavior Matrix

Generated: 5/17/2026, 4:39:57 PM

API key source: environment variable `MORPH_API_KEY`; value not printed. Requests ran sequentially from the repo root. Timings are wall-clock milliseconds measured around each API/SDK call.

## Direct answer

* Published SDK does **not** expose `auto`.
* This repo patches `@morphllm/morphsdk@0.2.171` with `model?: 'auto' | 'morph-v3-fast' | 'morph-v3-large'`.
* Patched SDK `large` omitted resolves to `auto`, then sends that model to `/v1/chat/completions`.
* Patched SDK `large: false` sends `morph-v3-fast`.
* Patched SDK `large: true` sends `morph-v3-large`.
* Raw Chat and Code Apply both accept `auto` in live tests.

## Request paths tested

| Path | Model sent / implied | Notes |
|:--|:--|:--|
| Patched SDK default omitted | `auto` | sdk-default-omitted |
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

Runs per scenario/path: 3. Total calls: 300; failed: 0.

| Transport | Pass | Avg ms | Min ms | Max ms |
|:--|--:|--:|--:|--:|
| Patched SDK default omitted | 30/30 | 736 | 412 | 6042 |
| SDK large=false | 30/30 | 474 | 353 | 580 |
| SDK large=true | 30/30 | 554 | 410 | 1078 |
| Raw chat fast | 30/30 | 418 | 354 | 707 |
| Raw chat large | 30/30 | 547 | 415 | 941 |
| Raw chat auto | 30/30 | 487 | 368 | 681 |
| Code Apply default | 30/30 | 373 | 350 | 501 |
| Code Apply fast | 30/30 | 373 | 351 | 495 |
| Code Apply large | 30/30 | 381 | 352 | 575 |
| Code Apply auto | 30/30 | 382 | 352 | 511 |

## Per-scenario comparison

### S01: Small JS validation

Instruction: I am adding number validation to the add function.

Result groups: 1 unique normalized output hash.

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 589 | 450 | 690 | `6dc5d7ed07d2` |  |
| SDK large=false | 3/3 | 471 | 353 | 580 | `6dc5d7ed07d2` |  |
| SDK large=true | 3/3 | 528 | 444 | 689 | `6dc5d7ed07d2` |  |
| Raw chat fast | 3/3 | 477 | 362 | 707 | `6dc5d7ed07d2` |  |
| Raw chat large | 3/3 | 634 | 544 | 780 | `6dc5d7ed07d2` |  |
| Raw chat auto | 3/3 | 562 | 458 | 681 | `6dc5d7ed07d2` |  |
| Code Apply default | 3/3 | 359 | 355 | 366 | `6dc5d7ed07d2` |  |
| Code Apply fast | 3/3 | 358 | 354 | 364 | `6dc5d7ed07d2` |  |
| Code Apply large | 3/3 | 361 | 354 | 372 | `6dc5d7ed07d2` |  |
| Code Apply auto | 3/3 | 442 | 356 | 488 | `6dc5d7ed07d2` |  |

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

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 456 | 412 | 539 | `2363b08eb289` |  |
| SDK large=false | 3/3 | 478 | 478 | 479 | `2363b08eb289` |  |
| SDK large=true | 3/3 | 495 | 410 | 539 | `2363b08eb289` |  |
| Raw chat fast | 3/3 | 361 | 358 | 364 | `2363b08eb289` |  |
| Raw chat large | 3/3 | 508 | 415 | 694 | `2363b08eb289` |  |
| Raw chat auto | 3/3 | 438 | 414 | 486 | `2363b08eb289` |  |
| Code Apply default | 3/3 | 407 | 360 | 500 | `2363b08eb289` |  |
| Code Apply fast | 3/3 | 363 | 360 | 368 | `2363b08eb289` |  |
| Code Apply large | 3/3 | 365 | 360 | 375 | `2363b08eb289` |  |
| Code Apply auto | 3/3 | 365 | 361 | 371 | `2363b08eb289` |  |

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

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 520 | 459 | 599 | `a783fdc485e0` |  |
| SDK large=false | 3/3 | 508 | 474 | 559 | `a783fdc485e0` |  |
| SDK large=true | 3/3 | 470 | 457 | 492 | `a783fdc485e0` |  |
| Raw chat fast | 3/3 | 455 | 385 | 505 | `a783fdc485e0` |  |
| Raw chat large | 3/3 | 513 | 461 | 615 | `a783fdc485e0` |  |
| Raw chat auto | 3/3 | 507 | 458 | 580 | `a783fdc485e0` |  |
| Code Apply default | 3/3 | 359 | 350 | 368 | `a783fdc485e0` |  |
| Code Apply fast | 3/3 | 358 | 351 | 366 | `a783fdc485e0` |  |
| Code Apply large | 3/3 | 359 | 352 | 370 | `a783fdc485e0` |  |
| Code Apply auto | 3/3 | 358 | 352 | 366 | `a783fdc485e0` |  |

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

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 526 | 490 | 586 | `a20a42edb579` |  |
| SDK large=false | 3/3 | 380 | 373 | 389 | `a20a42edb579` |  |
| SDK large=true | 3/3 | 691 | 573 | 922 | `a20a42edb579` |  |
| Raw chat fast | 3/3 | 377 | 372 | 385 | `a20a42edb579` |  |
| Raw chat large | 3/3 | 670 | 465 | 941 | `a20a42edb579` |  |
| Raw chat auto | 3/3 | 376 | 368 | 385 | `a20a42edb579` |  |
| Code Apply default | 3/3 | 375 | 367 | 385 | `a20a42edb579` |  |
| Code Apply fast | 3/3 | 375 | 369 | 383 | `a20a42edb579` |  |
| Code Apply large | 3/3 | 377 | 370 | 385 | `a20a42edb579` |  |
| Code Apply auto | 3/3 | 378 | 372 | 383 | `a20a42edb579` |  |

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

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 575 | 465 | 678 | `bd51698c7e68` |  |
| SDK large=false | 3/3 | 426 | 361 | 550 | `bd51698c7e68` |  |
| SDK large=true | 3/3 | 704 | 509 | 1078 | `bd51698c7e68` |  |
| Raw chat fast | 3/3 | 419 | 354 | 547 | `bd51698c7e68` |  |
| Raw chat large | 3/3 | 595 | 462 | 687 | `bd51698c7e68` |  |
| Raw chat auto | 3/3 | 490 | 465 | 506 | `bd51698c7e68` |  |
| Code Apply default | 3/3 | 356 | 350 | 362 | `bd51698c7e68` |  |
| Code Apply fast | 3/3 | 404 | 358 | 495 | `bd51698c7e68` |  |
| Code Apply large | 3/3 | 433 | 355 | 575 | `bd51698c7e68` |  |
| Code Apply auto | 3/3 | 363 | 355 | 370 | `bd51698c7e68` |  |

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

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 2446 | 562 | 6042 | `b2b05319f18e` |  |
| SDK large=false | 3/3 | 509 | 488 | 549 | `b2b05319f18e` |  |
| SDK large=true | 3/3 | 540 | 442 | 617 | `b2b05319f18e` |  |
| Raw chat fast | 3/3 | 476 | 364 | 695 | `b2b05319f18e` |  |
| Raw chat large | 3/3 | 519 | 444 | 664 | `b2b05319f18e` |  |
| Raw chat auto | 3/3 | 517 | 445 | 568 | `b2b05319f18e` |  |
| Code Apply default | 3/3 | 368 | 364 | 372 | `b2b05319f18e` |  |
| Code Apply fast | 3/3 | 364 | 361 | 366 | `b2b05319f18e` |  |
| Code Apply large | 3/3 | 403 | 359 | 482 | `b2b05319f18e` |  |
| Code Apply auto | 3/3 | 363 | 359 | 366 | `b2b05319f18e` |  |

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

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 513 | 460 | 616 | `3ac3b8b8097b` |  |
| SDK large=false | 3/3 | 479 | 476 | 483 | `3ac3b8b8097b` |  |
| SDK large=true | 3/3 | 502 | 460 | 575 | `3ac3b8b8097b` |  |
| Raw chat fast | 3/3 | 406 | 365 | 485 | `3ac3b8b8097b` |  |
| Raw chat large | 3/3 | 475 | 458 | 508 | `3ac3b8b8097b` |  |
| Raw chat auto | 3/3 | 461 | 457 | 465 | `3ac3b8b8097b` |  |
| Code Apply default | 3/3 | 366 | 363 | 368 | `3ac3b8b8097b` |  |
| Code Apply fast | 3/3 | 365 | 362 | 366 | `3ac3b8b8097b` |  |
| Code Apply large | 3/3 | 371 | 362 | 387 | `3ac3b8b8097b` |  |
| Code Apply auto | 3/3 | 412 | 360 | 511 | `3ac3b8b8097b` |  |

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

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 681 | 495 | 876 | `fbe125fb4475` |  |
| SDK large=false | 3/3 | 518 | 510 | 523 | `fbe125fb4475` |  |
| SDK large=true | 3/3 | 554 | 489 | 678 | `fbe125fb4475` |  |
| Raw chat fast | 3/3 | 449 | 378 | 575 | `fbe125fb4475` |  |
| Raw chat large | 3/3 | 582 | 492 | 639 | `fbe125fb4475` |  |
| Raw chat auto | 3/3 | 538 | 491 | 623 | `fbe125fb4475` |  |
| Code Apply default | 3/3 | 427 | 386 | 501 | `fbe125fb4475` |  |
| Code Apply fast | 3/3 | 385 | 382 | 391 | `fbe125fb4475` |  |
| Code Apply large | 3/3 | 384 | 380 | 392 | `fbe125fb4475` |  |
| Code Apply auto | 3/3 | 385 | 380 | 392 | `fbe125fb4475` |  |

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

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 576 | 432 | 761 | `da8daadc9db7` |  |
| SDK large=false | 3/3 | 477 | 474 | 479 | `da8daadc9db7` |  |
| SDK large=true | 3/3 | 503 | 432 | 597 | `da8daadc9db7` |  |
| Raw chat fast | 3/3 | 400 | 356 | 483 | `da8daadc9db7` |  |
| Raw chat large | 3/3 | 463 | 429 | 528 | `da8daadc9db7` |  |
| Raw chat auto | 3/3 | 504 | 433 | 543 | `da8daadc9db7` |  |
| Code Apply default | 3/3 | 358 | 357 | 359 | `da8daadc9db7` |  |
| Code Apply fast | 3/3 | 396 | 355 | 474 | `da8daadc9db7` |  |
| Code Apply large | 3/3 | 357 | 355 | 359 | `da8daadc9db7` |  |
| Code Apply auto | 3/3 | 357 | 355 | 359 | `da8daadc9db7` |  |

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

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 483 | 434 | 520 | `8328d916b2d0` |  |
| SDK large=false | 3/3 | 495 | 475 | 534 | `8328d916b2d0` |  |
| SDK large=true | 3/3 | 557 | 429 | 706 | `8328d916b2d0` |  |
| Raw chat fast | 3/3 | 359 | 355 | 364 | `8328d916b2d0` |  |
| Raw chat large | 3/3 | 506 | 429 | 552 | `8328d916b2d0` |  |
| Raw chat auto | 3/3 | 475 | 429 | 565 | `8328d916b2d0` |  |
| Code Apply default | 3/3 | 358 | 355 | 363 | `8328d916b2d0` |  |
| Code Apply fast | 3/3 | 357 | 354 | 362 | `8328d916b2d0` |  |
| Code Apply large | 3/3 | 400 | 357 | 483 | `8328d916b2d0` |  |
| Code Apply auto | 3/3 | 399 | 357 | 479 | `8328d916b2d0` |  |

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

