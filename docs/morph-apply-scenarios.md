# Morph Apply Matrix Scenarios

Generated: 2026-05-16 22:47:04 BRT

These are exact inputs used by `docs/morph-apply-behavior-matrix.md`. Each scenario/path pair ran 3 times.

## S01: Small JS validation

Instruction: I am adding number validation to the add function.

Checks:

* adds validation
* keeps return
* no marker leak

Original:

```ts
function add(a, b) {
  return a + b;
}

```

Edit snippet:

```ts
function add(a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new TypeError('Expected numbers');
  }
  return a + b;
}

```

## S02: Multi-hunk TypeScript import + options + body

Instruction: I am adding logger support and retry configuration to fetchUser.

Checks:

* adds logger import
* adds retries option
* uses logger
* passes retries
* no marker leak

Original:

```ts
import { request } from './http';

interface FetchUserOptions {
  includePosts?: boolean;
}

export async function fetchUser(id: string, options: FetchUserOptions = {}) {
  const response = await request('/users/' + id, {
    query: { includePosts: options.includePosts ?? false },
  });

  return response.json();
}

```

Edit snippet:

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

## S03: Delete helper and update caller

Instruction: I am removing the legacyNormalize helper and using normalizeName directly.

Checks:

* removes helper
* uses normalizeName
* keeps normalizeName
* no marker leak

Original:

```ts
function normalizeName(value) {
  return value.trim().toLowerCase();
}

function legacyNormalize(value) {
  return normalizeName(value).replace(/_/g, '-');
}

export function buildSlug(input) {
  return legacyNormalize(input);
}

```

Edit snippet:

```ts
function normalizeName(value) {
  return value.trim().toLowerCase();
}

export function buildSlug(input) {
  return normalizeName(input);
}

```

## S04: Long-value preservation with placeholder

Instruction: I am adding a request timeout setting while preserving existing secret-like values.

Checks:

* preserves longA
* preserves longB
* adds timeout
* no marker leak

Original:

```ts
export const settings = {
  encryptedToken: 'age1testvalue_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_end',
  encodedPayload: 'base64_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB_end',
  retries: 2,
};

```

Edit snippet:

```ts
export const settings = {
  // ... existing code ...
  retries: 2,
  requestTimeoutMs: 30000,
};

```

## S05: Duplicate context disambiguation

Instruction: I am enabling audit logging only for the admin route.

Checks:

* keeps public false
* sets admin true
* no marker leak

Original:

```ts
export const publicRoute = {
  path: '/public',
  audit: false,
  handler: handlePublic,
};

export const adminRoute = {
  path: '/admin',
  audit: false,
  handler: handleAdmin,
};

```

Edit snippet:

```ts
// ... existing code ...
export const adminRoute = {
  path: '/admin',
  audit: true,
  handler: handleAdmin,
};

```

## S06: Python error handling

Instruction: I am adding explicit FileNotFoundError handling to load_config.

Checks:

* adds try
* handles FileNotFoundError
* raises RuntimeError
* no marker leak

Original:

```python
import json

def load_config(path):
    with open(path) as fh:
        return json.load(fh)

```

Edit snippet:

```python
import json

def load_config(path):
    try:
        with open(path) as fh:
            return json.load(fh)
    except FileNotFoundError as exc:
        raise RuntimeError(f'Config not found: {path}') from exc

```

## S07: Markdown section insertion

Instruction: I am adding a troubleshooting section after installation.

Checks:

* adds heading
* keeps usage after troubleshooting
* no marker leak

Original:

```markdown
# Tool

## Install

Run pnpm install.

## Usage

Run pnpm dev.

```

Edit snippet:

```markdown
# Tool

## Install

Run pnpm install.

## Troubleshooting

If install fails, run pnpm install --force and retry.

## Usage

Run pnpm dev.

```

## S08: CSS duplicate selector target

Instruction: I am increasing only the primary button font weight.

Checks:

* primary 700
* secondary still 500
* base still 400
* no marker leak

Original:

```css
.button {
  border-radius: 4px;
  font-weight: 400;
}

.button.primary {
  background: blue;
  font-weight: 500;
}

.button.secondary {
  background: gray;
  font-weight: 500;
}

```

Edit snippet:

```css
// ... existing code ...
.button.primary {
  background: blue;
  font-weight: 700;
}
// ... existing code ...

```

## S09: Nested config object edit

Instruction: I am enabling metrics while preserving existing service config.

Checks:

* keeps host
* keeps port
* metrics true
* sampleRate updated
* no marker leak

Original:

```ts
export const config = {
  service: {
    host: 'localhost',
    port: 3000,
  },
  metrics: {
    enabled: false,
    sampleRate: 0.1,
  },
};

```

Edit snippet:

```ts
export const config = {
  // ... existing code ...
  metrics: {
    enabled: true,
    sampleRate: 0.25,
  },
};

```

## S10: Java class method addition

Instruction: I am adding a disabled-account check before returning access.

Checks:

* adds disabled check
* keeps null check
* keeps role check
* no marker leak

Original:

```java
public class AccessPolicy {
    public boolean canAccess(User user) {
        if (user == null) {
            return false;
        }
        return user.hasRole("admin");
    }
}

```

Edit snippet:

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

