---
name: quick-edit
description: Advanced marker patterns for quick_edit — block, inline, multi-field, reorder, sparse touch, nested object skipping. Load when you need pattern guidance or want to verify the most token-efficient codeEdit shape.
---

# quick_edit marker patterns

`codeEdit` must contain only changed sections. Everything else is a marker. The goal is the shortest unambiguous description of the change.

## Block marker

Skip unchanged regions between changes:

```
function login(email, password) {
  // ... existing code ...
  await sessionStore.set(`session:${token}`, userId);
  // ... existing code ...
}
```

## Inline marker — multiple per line

Skip unchanged fields on the same dense line. Each marker expands independently:

```typescript
const cfg = { host: 'new-host', port: // ... existing ..., name: // ... existing ..., ssl: // ... existing ..., pool: 20 };
```

One inline marker skips any value including an entire nested object:

```typescript
{ primary: { host: 'new', port: // ... existing ..., creds: // ... existing ... }, replica: // ... existing ... }
```

## Reorder without retyping

List the new order. Mark each unchanged field value inline — never retype values that did not change:

```typescript
const ROUTES = {
  api:     { path: // ... existing ..., auth: // ... existing ..., cache: // ... existing ... },
  docs:    { path: // ... existing ..., auth: // ... existing ..., cache: 7200 },
  home:    { path: // ... existing ..., auth: // ... existing ..., cache: // ... existing ... },
  profile: { path: // ... existing ..., auth: // ... existing ..., cache: // ... existing ... },
};
```

## Sparse touch in long files

Two block markers bracket the changed entry. Everything between is a single skip:

```typescript
export const FLAGS = {
// ... existing code ...
  FEATURE_05: true,
// ... existing code ...
  FEATURE_29: true,
// ... existing code ...
};
```

## SQL / multi-section files

Block markers skip unchanged table definitions or sections:

```sql
CREATE TABLE users (
  // ... existing code ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE products (
  // ... existing code ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

// ... existing code ...
```

## Method body with scattered changes

Block markers skip unchanged method bodies; inline markers skip unchanged method signatures:

```typescript
class AuthService {
  // ... existing code ...
  private readonly sessionStore: Cache;
  // ... existing code ...

  constructor(deps: { db: Database; mailer: Mailer; sessionStore: Cache }) {
    // ... existing code ...
    this.sessionStore = deps.sessionStore;
  }

  async login(// ... existing ...) {
    // ... existing code ...
    await this.sessionStore.set(`session:${token}`, userId);
    // ... existing code ...
  }

  // ... existing code ...

  async verifySession(token: string): Promise<string | null> {
    return this.sessionStore.get(`session:${token}`);
  }
}
```

## Verified limits

- Multiple inline markers on one line: ✔ all expand independently
- Single inline marker skipping entire nested object: ✔
- Verbatim marker string in original file: ✔ preserved correctly
- Marker as intended literal output: ✘ no escape — Morph always expands it
