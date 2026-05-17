# Morph Apply Behavior Matrix

Generated: 5/16/2026, 11:15:51 PM

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
| Patched SDK default omitted | 30/30 | 517 | 369 | 798 |
| SDK large=false | 30/30 | 382 | 351 | 541 |
| SDK large=true | 30/30 | 511 | 415 | 923 |
| Raw chat fast | 30/30 | 383 | 352 | 621 |
| Raw chat large | 30/30 | 535 | 415 | 1087 |
| Raw chat auto | 30/30 | 534 | 373 | 1120 |
| Code Apply default | 30/30 | 387 | 351 | 567 |
| Code Apply fast | 30/30 | 368 | 350 | 473 |
| Code Apply large | 30/30 | 380 | 352 | 552 |
| Code Apply auto | 30/30 | 366 | 352 | 478 |

## Per-scenario comparison

### S01: Small JS validation

Instruction: I am adding number validation to the add function.

Result groups: 1 unique normalized output hash.

| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |
|:--|:--:|--:|--:|--:|:--|:--|
| Patched SDK default omitted | 3/3 | 590 | 454 | 798 | `6dc5d7ed07d2` |  |
| SDK large=false | 3/3 | 413 | 353 | 531 | `6dc5d7ed07d2` |  |
| SDK large=true | 3/3 | 486 | 453 | 551 | `6dc5d7ed07d2` |  |
| Raw chat fast | 3/3 | 398 | 352 | 488 | `6dc5d7ed07d2` |  |
| Raw chat large | 3/3 | 581 | 452 | 674 | `6dc5d7ed07d2` |  |
| Raw chat auto | 3/3 | 508 | 448 | 625 | `6dc5d7ed07d2` |  |
| Code Apply default | 3/3 | 355 | 354 | 357 | `6dc5d7ed07d2` |  |
| Code Apply fast | 3/3 | 355 | 353 | 357 | `6dc5d7ed07d2` |  |
| Code Apply large | 3/3 | 395 | 352 | 477 | `6dc5d7ed07d2` |  |
| Code Apply auto | 3/3 | 396 | 354 | 478 | `6dc5d7ed07d2` |  |

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
| Patched SDK default omitted | 3/3 | 482 | 417 | 604 | `2363b08eb289` |  |
| SDK large=false | 3/3 | 356 | 354 | 359 | `2363b08eb289` |  |
| SDK large=true | 3/3 | 422 | 415 | 433 | `2363b08eb289` |  |
| Raw chat fast | 3/3 | 357 | 355 | 359 | `2363b08eb289` |  |
| Raw chat large | 3/3 | 419 | 415 | 426 | `2363b08eb289` |  |
| Raw chat auto | 3/3 | 433 | 415 | 460 | `2363b08eb289` |  |
| Code Apply default | 3/3 | 428 | 358 | 567 | `2363b08eb289` |  |
| Code Apply fast | 3/3 | 375 | 355 | 411 | `2363b08eb289` |  |
| Code Apply large | 3/3 | 359 | 356 | 362 | `2363b08eb289` |  |
| Code Apply auto | 3/3 | 358 | 356 | 360 | `2363b08eb289` |  |

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
| Patched SDK default omitted | 3/3 | 525 | 461 | 602 | `a783fdc485e0` |  |
| SDK large=false | 3/3 | 357 | 354 | 359 | `a783fdc485e0` |  |
| SDK large=true | 3/3 | 466 | 455 | 472 | `a783fdc485e0` |  |
| Raw chat fast | 3/3 | 357 | 355 | 359 | `a783fdc485e0` |  |
| Raw chat large | 3/3 | 511 | 469 | 592 | `a783fdc485e0` |  |
| Raw chat auto | 3/3 | 507 | 468 | 580 | `a783fdc485e0` |  |
| Code Apply default | 3/3 | 357 | 354 | 361 | `a783fdc485e0` |  |
| Code Apply fast | 3/3 | 356 | 354 | 357 | `a783fdc485e0` |  |
| Code Apply large | 3/3 | 356 | 353 | 357 | `a783fdc485e0` |  |
| Code Apply auto | 3/3 | 356 | 355 | 356 | `a783fdc485e0` |  |

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
| Patched SDK default omitted | 3/3 | 372 | 369 | 374 | `a20a42edb579` |  |
| SDK large=false | 3/3 | 393 | 372 | 435 | `a20a42edb579` |  |
| SDK large=true | 3/3 | 505 | 469 | 576 | `a20a42edb579` |  |
| Raw chat fast | 3/3 | 457 | 372 | 621 | `a20a42edb579` |  |
| Raw chat large | 3/3 | 565 | 465 | 752 | `a20a42edb579` |  |
| Raw chat auto | 3/3 | 424 | 373 | 513 | `a20a42edb579` |  |
| Code Apply default | 3/3 | 417 | 382 | 460 | `a20a42edb579` |  |
| Code Apply fast | 3/3 | 376 | 367 | 381 | `a20a42edb579` |  |
| Code Apply large | 3/3 | 377 | 371 | 382 | `a20a42edb579` |  |
| Code Apply auto | 3/3 | 376 | 368 | 382 | `a20a42edb579` |  |

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
| Patched SDK default omitted | 3/3 | 669 | 650 | 692 | `bd51698c7e68` |  |
| SDK large=false | 3/3 | 385 | 352 | 442 | `bd51698c7e68` |  |
| SDK large=true | 3/3 | 571 | 501 | 708 | `bd51698c7e68` |  |
| Raw chat fast | 3/3 | 362 | 355 | 368 | `bd51698c7e68` |  |
| Raw chat large | 3/3 | 543 | 505 | 618 | `bd51698c7e68` |  |
| Raw chat auto | 3/3 | 557 | 500 | 670 | `bd51698c7e68` |  |
| Code Apply default | 3/3 | 422 | 351 | 552 | `bd51698c7e68` |  |
| Code Apply fast | 3/3 | 366 | 352 | 382 | `bd51698c7e68` |  |
| Code Apply large | 3/3 | 358 | 353 | 363 | `bd51698c7e68` |  |
| Code Apply auto | 3/3 | 363 | 354 | 373 | `bd51698c7e68` |  |

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
| Patched SDK default omitted | 3/3 | 572 | 445 | 712 | `b2b05319f18e` |  |
| SDK large=false | 3/3 | 356 | 353 | 361 | `b2b05319f18e` |  |
| SDK large=true | 3/3 | 527 | 448 | 568 | `b2b05319f18e` |  |
| Raw chat fast | 3/3 | 359 | 354 | 369 | `b2b05319f18e` |  |
| Raw chat large | 3/3 | 520 | 451 | 573 | `b2b05319f18e` |  |
| Raw chat auto | 3/3 | 669 | 444 | 1120 | `b2b05319f18e` |  |
| Code Apply default | 3/3 | 423 | 356 | 549 | `b2b05319f18e` |  |
| Code Apply fast | 3/3 | 359 | 354 | 365 | `b2b05319f18e` |  |
| Code Apply large | 3/3 | 423 | 356 | 552 | `b2b05319f18e` |  |
| Code Apply auto | 3/3 | 359 | 354 | 363 | `b2b05319f18e` |  |

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
| Patched SDK default omitted | 3/3 | 502 | 462 | 578 | `3ac3b8b8097b` |  |
| SDK large=false | 3/3 | 372 | 364 | 382 | `3ac3b8b8097b` |  |
| SDK large=true | 3/3 | 571 | 498 | 609 | `3ac3b8b8097b` |  |
| Raw chat fast | 3/3 | 367 | 364 | 372 | `3ac3b8b8097b` |  |
| Raw chat large | 3/3 | 506 | 461 | 596 | `3ac3b8b8097b` |  |
| Raw chat auto | 3/3 | 549 | 462 | 719 | `3ac3b8b8097b` |  |
| Code Apply default | 3/3 | 368 | 363 | 372 | `3ac3b8b8097b` |  |
| Code Apply fast | 3/3 | 366 | 364 | 369 | `3ac3b8b8097b` |  |
| Code Apply large | 3/3 | 447 | 365 | 492 | `3ac3b8b8097b` |  |
| Code Apply auto | 3/3 | 361 | 359 | 363 | `3ac3b8b8097b` |  |

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
| Patched SDK default omitted | 3/3 | 543 | 494 | 638 | `fbe125fb4475` |  |
| SDK large=false | 3/3 | 418 | 376 | 502 | `fbe125fb4475` |  |
| SDK large=true | 3/3 | 638 | 494 | 923 | `fbe125fb4475` |  |
| Raw chat fast | 3/3 | 377 | 376 | 378 | `fbe125fb4475` |  |
| Raw chat large | 3/3 | 582 | 493 | 751 | `fbe125fb4475` |  |
| Raw chat auto | 3/3 | 644 | 592 | 704 | `fbe125fb4475` |  |
| Code Apply default | 3/3 | 376 | 375 | 377 | `fbe125fb4475` |  |
| Code Apply fast | 3/3 | 376 | 375 | 377 | `fbe125fb4475` |  |
| Code Apply large | 3/3 | 376 | 375 | 378 | `fbe125fb4475` |  |
| Code Apply auto | 3/3 | 384 | 375 | 403 | `fbe125fb4475` |  |

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
| Patched SDK default omitted | 3/3 | 477 | 437 | 553 | `da8daadc9db7` |  |
| SDK large=false | 3/3 | 419 | 352 | 541 | `da8daadc9db7` |  |
| SDK large=true | 3/3 | 496 | 437 | 613 | `da8daadc9db7` |  |
| Raw chat fast | 3/3 | 355 | 353 | 357 | `da8daadc9db7` |  |
| Raw chat large | 3/3 | 654 | 437 | 1087 | `da8daadc9db7` |  |
| Raw chat auto | 3/3 | 519 | 437 | 682 | `da8daadc9db7` |  |
| Code Apply default | 3/3 | 354 | 353 | 355 | `da8daadc9db7` |  |
| Code Apply fast | 3/3 | 352 | 350 | 354 | `da8daadc9db7` |  |
| Code Apply large | 3/3 | 353 | 353 | 354 | `da8daadc9db7` |  |
| Code Apply auto | 3/3 | 354 | 352 | 356 | `da8daadc9db7` |  |

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
| Patched SDK default omitted | 3/3 | 437 | 430 | 442 | `8328d916b2d0` |  |
| SDK large=false | 3/3 | 352 | 351 | 353 | `8328d916b2d0` |  |
| SDK large=true | 3/3 | 433 | 425 | 439 | `8328d916b2d0` |  |
| Raw chat fast | 3/3 | 438 | 354 | 587 | `8328d916b2d0` |  |
| Raw chat large | 3/3 | 470 | 430 | 536 | `8328d916b2d0` |  |
| Raw chat auto | 3/3 | 527 | 440 | 699 | `8328d916b2d0` |  |
| Code Apply default | 3/3 | 365 | 357 | 377 | `8328d916b2d0` |  |
| Code Apply fast | 3/3 | 395 | 355 | 473 | `8328d916b2d0` |  |
| Code Apply large | 3/3 | 355 | 353 | 357 | `8328d916b2d0` |  |
| Code Apply auto | 3/3 | 355 | 355 | 356 | `8328d916b2d0` |  |

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

