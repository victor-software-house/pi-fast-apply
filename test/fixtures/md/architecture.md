# Platform Architecture

This document describes the high-level architecture of the platform API service,
its major subsystems, deployment topology, and the key decisions that shaped them.

> **Audience:** engineers joining the project, reviewers, and on-call responders.
> It is intentionally concise — follow the linked ADRs for full rationale.

---

## Table of Contents

1. [Overview](#overview)
2. [Request Lifecycle](#request-lifecycle)
3. [Subsystems](#subsystems)
   - [Auth](#auth)
   - [Database](#database)
   - [Cache](#cache)
   - [Storage](#storage)
4. [Deployment](#deployment)
5. [Observability](#observability)
6. [Decision Log](#decision-log)

---

## Overview

The platform is a monolithic Node.js HTTP API backed by PostgreSQL and Redis.
It serves web and mobile clients over HTTPS and exposes a webhook interface
for third-party integrations.

```
                       ┌─────────────────────────────────────────┐
  Browser / Mobile ───▶│  CDN / Load Balancer  (TLS termination) │
                        └────────────────┬────────────────────────┘
                                         │
                        ┌────────────────▼────────────────────────┐
                        │           API Servers (Node.js)          │
                        │   ┌──────────┐  ┌──────────┐            │
                        │   │ Instance │  │ Instance │  …          │
                        │   └────┬─────┘  └────┬─────┘            │
                        └────────┼─────────────┼───────────────────┘
                                 │             │
              ┌──────────────────▼─────────────▼──────────────┐
              │             Shared Infrastructure               │
              │  ┌──────────────┐  ┌──────────┐  ┌─────────┐  │
              │  │  PostgreSQL  │  │  Redis   │  │  S3/GCS │  │
              │  └──────────────┘  └──────────┘  └─────────┘  │
              └────────────────────────────────────────────────┘
```

All API instances are stateless — session state lives in Redis, persistent data
in PostgreSQL, and binary assets in object storage.

---

## Request Lifecycle

A typical authenticated request flows through the following layers:

1. **TLS termination** at the load balancer (NGINX or cloud LB).
2. **Rate limiting** — checked against a Redis sliding-window counter keyed by
   `{ip}:{route}`. Requests exceeding the limit receive `429 Too Many Requests`.
3. **Auth middleware** — validates the `Authorization: Bearer <token>` header,
   decodes the JWT, and attaches the `AuthContext` to the request object.
4. **Route handler** — executes business logic, interacts with the DB/cache,
   and builds the response payload.
5. **Response serialisation** — all responses use the `ApiResponse<T>` envelope:
   ```json
   { "status": "ok", "data": { … }, "requestId": "req_abc123" }
   ```
6. **Access log** — request metadata (method, route, status, duration, userId)
   is emitted as structured JSON to stdout.

---

## Subsystems

### Auth

Authentication uses short-lived access tokens (15 min) paired with long-lived
refresh tokens (7 days) following the refresh-token rotation pattern.

| Concept | Detail |
|:--------|:-------|
| Token format | Compact HS256-signed `header.payload.sig` |
| Refresh storage | Server-side in Redis, keyed by `session:{sessionId}` |
| Rotation | Every refresh call issues a new pair and revokes the old one |
| Theft detection | Reuse of a revoked refresh token → all user sessions wiped |
| Max sessions | 5 concurrent sessions per user |

```ts
// Verify and narrow the result:
const result = authService.verify(accessToken);
if ('code' in result) {
  // AuthError — inspect result.code
} else {
  // AuthContext — result.userId, result.role, result.exp
}
```

Password hashing uses **bcrypt** with a minimum of 12 rounds. Passwords are
never logged or stored in plaintext.

### Database

PostgreSQL 16, accessed via the `pg` driver with a connection pool.

- **Pool size:** min 2 / max 10 (configurable via `DATABASE_POOL_*` env vars).
- **Schema migrations** are managed with a bespoke migration runner that tracks
  state in a `schema_migrations` table. Migrations run automatically on startup
  when `MIGRATE_ON_STARTUP=true` (default: off).
- **Transactions:** all multi-step writes use explicit transactions.
  The pattern is `BEGIN … COMMIT` with `ROLLBACK` on any thrown error.
- **Prepared statements:** high-frequency queries are prepared on first use and
  cached for the lifetime of the pool connection.

#### Schema conventions

- All tables have an `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- Timestamps are `TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Soft deletes use a `deleted_at TIMESTAMPTZ` column rather than physical deletion.
- Foreign keys are always declared with `ON DELETE RESTRICT` unless the domain
  explicitly requires cascade behaviour.

### Cache

Redis 7, used for:

| Use case | Key pattern | TTL |
|:---------|:------------|:----|
| Session data | `session:{sessionId}` | 7 days |
| Rate-limit counters | `rl:{ip}:{route}:{window}` | 60 s |
| Feature flags | `flags:{name}` | 5 min |
| User profile cache | `profile:{userId}` | 5 min |

All cache reads use a **read-aside** pattern: check cache → on miss, read from
DB and populate the cache.

Cache invalidation on write uses key-based deletion; there are no pub/sub
invalidation channels in the current design.

### Storage

Binary assets (avatars, post attachments) are stored in **S3-compatible object
storage**. The `STORAGE_PROVIDER` env var selects the active backend:

- `local` — writes to a local directory (development only)
- `s3` — AWS S3 or any S3-compatible endpoint (MinIO, Cloudflare R2, etc.)
- `gcs` — Google Cloud Storage via the S3 interoperability API

Upload flow:

1. Client requests a pre-signed upload URL from `POST /v1/uploads`.
2. Client uploads directly to the storage backend (bypasses the API server).
3. Client notifies the API via `POST /v1/uploads/:id/confirm`.
4. API validates the upload exists, records the metadata, and returns the
   `MediaAttachment` resource.

---

## Deployment

### Environments

| Name | Purpose | Auto-deploy |
|:-----|:--------|:------------|
| `dev` | Feature branch previews | On PR open |
| `staging` | Pre-release integration testing | On merge to `main` |
| `production` | Live traffic | Manual promote from staging |

### Container

The service ships as a single Docker image built from a multi-stage Dockerfile:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
```

### Health checks

- `GET /healthz` — shallow liveness check (always 200 if the process is running).
- `GET /readyz` — readiness check (200 only when DB and Redis connections are
  live and migrations are up to date).

---

## Observability

### Logging

Structured JSON logs are emitted to stdout on every request. Each line includes:

```json
{
  "ts": "2026-04-03T08:00:00.000Z",
  "level": "info",
  "msg": "request",
  "method": "POST",
  "path": "/v1/auth/login",
  "status": 200,
  "durationMs": 42,
  "requestId": "req_abc123",
  "userId": null
}
```

Log level is controlled by `LOG_LEVEL` (`debug | info | warn | error`).

### Tracing

OpenTelemetry traces are exported to an OTLP-compatible collector when
`TRACING_ENABLED=true`. Spans are created for:

- Incoming HTTP requests
- Outbound DB queries
- Redis operations
- External HTTP calls

### Metrics

A Prometheus `/metrics` endpoint is available when `METRICS_ENABLED=true`
(default port 9090). Key metrics:

| Metric | Type | Labels |
|:-------|:-----|:-------|
| `http_request_duration_ms` | Histogram | `method`, `route`, `status` |
| `db_query_duration_ms` | Histogram | `operation` |
| `cache_hits_total` | Counter | `key_pattern` |
| `auth_failures_total` | Counter | `code` |
| `active_sessions` | Gauge | — |

---

## Decision Log

### ADR-001 — Monolith over microservices

**Decision:** Ship as a single deployable unit.

**Rationale:** The team size and traffic volume do not justify the operational
overhead of a distributed system at this stage. A well-structured monolith is
easier to refactor later than a prematurely decomposed one.

**Revisit when:** any single subsystem accounts for >40% of p99 latency or
requires an independent deployment cadence.

### ADR-002 — HS256 over RS256 for token signing

**Decision:** Use HMAC-SHA256 with a shared secret rather than RSA key pairs.

**Rationale:** There are no external token consumers that need to verify tokens
independently. RS256 adds key-management complexity without a current benefit.

**Revisit when:** a third-party service needs to verify tokens without calling
our introspection endpoint.

### ADR-003 — Read-aside caching over write-through

**Decision:** Populate the cache on read misses rather than on every write.

**Rationale:** Write-through requires every write path to be cache-aware.
Read-aside keeps writes simple at the cost of serving a stale cache entry for
up to one TTL window after a write. For our access patterns this trade-off is
acceptable.

### ADR-004 — Direct S3 upload (pre-signed URLs)

**Decision:** Clients upload files directly to object storage; the API only
issues pre-signed URLs and validates completions.

**Rationale:** Routing binary data through the API server wastes bandwidth,
blocks request-handling threads, and increases cost. Pre-signed URLs delegate
upload I/O to the storage provider with no server involvement.
