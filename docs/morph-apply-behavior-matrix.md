# Morph Apply Behavior Matrix

Generated: 2026-05-16 22:47:04 BRT.

API key source: fnox secret name `MORPH_API_KEY`; value not printed. Requests ran sequentially from the repo root. Timings are wall-clock milliseconds measured around each API/SDK call.

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
| Patched SDK default omitted | 30/30 | 523 | 401 | 750 |
| SDK large=false | 30/30 | 445 | 365 | 639 |
| SDK large=true | 30/30 | 510 | 430 | 717 |
| Raw chat fast | 30/30 | 411 | 352 | 943 |
| Raw chat large | 30/30 | 649 | 427 | 4552 |
| Raw chat auto | 30/30 | 472 | 372 | 736 |
| Code Apply default | 30/30 | 404 | 354 | 573 |
| Code Apply fast | 30/30 | 373 | 352 | 546 |
| Code Apply large | 30/30 | 386 | 351 | 545 |
| Code Apply auto | 30/30 | 381 | 351 | 493 |

## Per-scenario comparison

### S01: Small JS validation

Instruction: I am adding number validation to the add function.

Result groups: 1 unique normalized output hash.

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 557 | 460 | 750 | `6dc5d7ed07d2` |  |
| SDK large=false | 3/3 | 483 | 370 | 639 | `6dc5d7ed07d2` |  |
| SDK large=true | 3/3 | 458 | 455 | 462 | `6dc5d7ed07d2` |  |
| Raw chat fast | 3/3 | 557 | 357 | 943 | `6dc5d7ed07d2` |  |
| Raw chat large | 3/3 | 543 | 454 | 589 | `6dc5d7ed07d2` |  |
| Raw chat auto | 3/3 | 451 | 445 | 454 | `6dc5d7ed07d2` |  |
| Code Apply default | 3/3 | 406 | 360 | 491 | `6dc5d7ed07d2` |  |
| Code Apply fast | 3/3 | 362 | 355 | 368 | `6dc5d7ed07d2` |  |
| Code Apply large | 3/3 | 364 | 355 | 372 | `6dc5d7ed07d2` |  |
| Code Apply auto | 3/3 | 363 | 359 | 368 | `6dc5d7ed07d2` |  |

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
| Patched SDK default omitted | 3/3 | 483 | 434 | 563 | `2363b08eb289` |  |
| SDK large=false | 3/3 | 501 | 386 | 607 | `2363b08eb289` |  |
| SDK large=true | 3/3 | 470 | 430 | 549 | `2363b08eb289` |  |
| Raw chat fast | 3/3 | 423 | 357 | 547 | `2363b08eb289` |  |
| Raw chat large | 3/3 | 464 | 427 | 535 | `2363b08eb289` |  |
| Raw chat auto | 3/3 | 420 | 416 | 428 | `2363b08eb289` |  |
| Code Apply default | 3/3 | 411 | 363 | 505 | `2363b08eb289` |  |
| Code Apply fast | 3/3 | 367 | 358 | 372 | `2363b08eb289` |  |
| Code Apply large | 3/3 | 424 | 358 | 545 | `2363b08eb289` |  |
| Code Apply auto | 3/3 | 361 | 356 | 368 | `2363b08eb289` |  |

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
| Patched SDK default omitted | 3/3 | 487 | 485 | 488 | `a783fdc485e0` |  |
| SDK large=false | 3/3 | 383 | 374 | 401 | `a783fdc485e0` |  |
| SDK large=true | 3/3 | 521 | 471 | 615 | `a783fdc485e0` |  |
| Raw chat fast | 3/3 | 362 | 357 | 370 | `a783fdc485e0` |  |
| Raw chat large | 3/3 | 561 | 466 | 744 | `a783fdc485e0` |  |
| Raw chat auto | 3/3 | 488 | 472 | 504 | `a783fdc485e0` |  |
| Code Apply default | 3/3 | 407 | 359 | 495 | `a783fdc485e0` |  |
| Code Apply fast | 3/3 | 423 | 355 | 546 | `a783fdc485e0` |  |
| Code Apply large | 3/3 | 404 | 356 | 498 | `a783fdc485e0` |  |
| Code Apply auto | 3/3 | 359 | 351 | 370 | `a783fdc485e0` |  |

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
| Patched SDK default omitted | 3/3 | 492 | 401 | 544 | `a20a42edb579` |  |
| SDK large=false | 3/3 | 399 | 392 | 404 | `a20a42edb579` |  |
| SDK large=true | 3/3 | 591 | 492 | 669 | `a20a42edb579` |  |
| Raw chat fast | 3/3 | 427 | 375 | 520 | `a20a42edb579` |  |
| Raw chat large | 3/3 | 553 | 463 | 724 | `a20a42edb579` |  |
| Raw chat auto | 3/3 | 381 | 372 | 386 | `a20a42edb579` |  |
| Code Apply default | 3/3 | 388 | 369 | 410 | `a20a42edb579` |  |
| Code Apply fast | 3/3 | 380 | 369 | 387 | `a20a42edb579` |  |
| Code Apply large | 3/3 | 381 | 372 | 386 | `a20a42edb579` |  |
| Code Apply auto | 3/3 | 422 | 385 | 493 | `a20a42edb579` |  |

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
| Patched SDK default omitted | 3/3 | 542 | 481 | 629 | `bd51698c7e68` |  |
| SDK large=false | 3/3 | 462 | 383 | 509 | `bd51698c7e68` |  |
| SDK large=true | 3/3 | 480 | 476 | 486 | `bd51698c7e68` |  |
| Raw chat fast | 3/3 | 376 | 370 | 381 | `bd51698c7e68` |  |
| Raw chat large | 3/3 | 529 | 491 | 584 | `bd51698c7e68` |  |
| Raw chat auto | 3/3 | 574 | 464 | 736 | `bd51698c7e68` |  |
| Code Apply default | 3/3 | 369 | 362 | 377 | `bd51698c7e68` |  |
| Code Apply fast | 3/3 | 373 | 361 | 386 | `bd51698c7e68` |  |
| Code Apply large | 3/3 | 372 | 367 | 377 | `bd51698c7e68` |  |
| Code Apply auto | 3/3 | 401 | 358 | 475 | `bd51698c7e68` |  |

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
| Patched SDK default omitted | 3/3 | 544 | 486 | 595 | `b2b05319f18e` |  |
| SDK large=false | 3/3 | 396 | 375 | 430 | `b2b05319f18e` |  |
| SDK large=true | 3/3 | 463 | 461 | 465 | `b2b05319f18e` |  |
| Raw chat fast | 3/3 | 381 | 357 | 417 | `b2b05319f18e` |  |
| Raw chat large | 3/3 | 1911 | 545 | 4552 | `b2b05319f18e` |  |
| Raw chat auto | 3/3 | 474 | 447 | 529 | `b2b05319f18e` |  |
| Code Apply default | 3/3 | 433 | 371 | 541 | `b2b05319f18e` |  |
| Code Apply fast | 3/3 | 360 | 354 | 369 | `b2b05319f18e` |  |
| Code Apply large | 3/3 | 395 | 353 | 478 | `b2b05319f18e` |  |
| Code Apply auto | 3/3 | 416 | 352 | 469 | `b2b05319f18e` |  |

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
| Patched SDK default omitted | 3/3 | 577 | 483 | 731 | `3ac3b8b8097b` |  |
| SDK large=false | 3/3 | 503 | 499 | 508 | `3ac3b8b8097b` |  |
| SDK large=true | 3/3 | 600 | 467 | 717 | `3ac3b8b8097b` |  |
| Raw chat fast | 3/3 | 372 | 363 | 382 | `3ac3b8b8097b` |  |
| Raw chat large | 3/3 | 520 | 464 | 603 | `3ac3b8b8097b` |  |
| Raw chat auto | 3/3 | 549 | 461 | 723 | `3ac3b8b8097b` |  |
| Code Apply default | 3/3 | 411 | 365 | 504 | `3ac3b8b8097b` |  |
| Code Apply fast | 3/3 | 362 | 361 | 362 | `3ac3b8b8097b` |  |
| Code Apply large | 3/3 | 363 | 361 | 367 | `3ac3b8b8097b` |  |
| Code Apply auto | 3/3 | 362 | 361 | 363 | `3ac3b8b8097b` |  |

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
| Patched SDK default omitted | 3/3 | 513 | 503 | 518 | `fbe125fb4475` |  |
| SDK large=false | 3/3 | 433 | 385 | 513 | `fbe125fb4475` |  |
| SDK large=true | 3/3 | 581 | 517 | 709 | `fbe125fb4475` |  |
| Raw chat fast | 3/3 | 419 | 378 | 498 | `fbe125fb4475` |  |
| Raw chat large | 3/3 | 501 | 497 | 505 | `fbe125fb4475` |  |
| Raw chat auto | 3/3 | 498 | 495 | 501 | `fbe125fb4475` |  |
| Code Apply default | 3/3 | 378 | 377 | 379 | `fbe125fb4475` |  |
| Code Apply fast | 3/3 | 378 | 377 | 379 | `fbe125fb4475` |  |
| Code Apply large | 3/3 | 428 | 379 | 498 | `fbe125fb4475` |  |
| Code Apply auto | 3/3 | 378 | 377 | 380 | `fbe125fb4475` |  |

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
| Patched SDK default omitted | 3/3 | 496 | 453 | 576 | `da8daadc9db7` |  |
| SDK large=false | 3/3 | 480 | 365 | 587 | `da8daadc9db7` |  |
| SDK large=true | 3/3 | 487 | 442 | 572 | `da8daadc9db7` |  |
| Raw chat fast | 3/3 | 428 | 352 | 573 | `da8daadc9db7` |  |
| Raw chat large | 3/3 | 477 | 437 | 554 | `da8daadc9db7` |  |
| Raw chat auto | 3/3 | 433 | 429 | 438 | `da8daadc9db7` |  |
| Code Apply default | 3/3 | 432 | 354 | 573 | `da8daadc9db7` |  |
| Code Apply fast | 3/3 | 364 | 354 | 370 | `da8daadc9db7` |  |
| Code Apply large | 3/3 | 366 | 351 | 378 | `da8daadc9db7` |  |
| Code Apply auto | 3/3 | 365 | 354 | 371 | `da8daadc9db7` |  |

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
| Patched SDK default omitted | 3/3 | 533 | 451 | 610 | `8328d916b2d0` |  |
| SDK large=false | 3/3 | 409 | 365 | 495 | `8328d916b2d0` |  |
| SDK large=true | 3/3 | 446 | 439 | 451 | `8328d916b2d0` |  |
| Raw chat fast | 3/3 | 364 | 353 | 371 | `8328d916b2d0` |  |
| Raw chat large | 3/3 | 437 | 434 | 440 | `8328d916b2d0` |  |
| Raw chat auto | 3/3 | 452 | 428 | 482 | `8328d916b2d0` |  |
| Code Apply default | 3/3 | 400 | 354 | 478 | `8328d916b2d0` |  |
| Code Apply fast | 3/3 | 358 | 352 | 367 | `8328d916b2d0` |  |
| Code Apply large | 3/3 | 362 | 354 | 369 | `8328d916b2d0` |  |
| Code Apply auto | 3/3 | 387 | 354 | 439 | `8328d916b2d0` |  |

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

