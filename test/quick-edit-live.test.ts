/**
 * Live integration tests for quick_edit / Morph Fast Apply marker behavior.
 *
 * Validates that the model correctly expands '// ... existing code ...' markers
 * across complex realistic scenarios. Each scenario runs RUNS times to discount
 * cold-start variance; exact output is locked via toMatchInlineSnapshot.
 *
 * Run:          MORPH_API_KEY=$(fnox get MORPH_API_KEY) pnpm run test:quick-edit-live
 * Refresh snaps: ... pnpm run test:quick-edit-live -- --update-snapshots
 *
 * Skipped automatically when MORPH_API_KEY is absent.
 */
import { performance } from 'node:perf_hooks';
import { applyEdit } from '@morphllm/morphsdk';
import { afterAll, describe, expect, test } from 'vitest';

const apiKey = process.env.MORPH_API_KEY;

/** Number of API calls per scenario. First is cold/warm-up; rest used for median. */
const RUNS = 3;

// ─── Fixture: complex TypeScript class refactor ────────────────────────────
const CLASS_ORIGINAL = `\
export class AuthService {
  private readonly db: Database;
  private readonly mailer: Mailer;
  private readonly cache: Cache;
  private readonly logger: Logger;

  constructor(deps: { db: Database; mailer: Mailer; cache: Cache; logger: Logger }) {
    this.db = deps.db;
    this.mailer = deps.mailer;
    this.cache = deps.cache;
    this.logger = deps.logger;
  }

  async login(email: string, password: string): Promise<Session> {
    const user = await this.db.users.findByEmail(email);
    if (!user) throw new AuthError('user_not_found');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AuthError('invalid_password');
    const token = crypto.randomUUID();
    await this.cache.set(\`session:\${token}\`, user.id, 86400);
    this.logger.info('login', { userId: user.id });
    return { token, userId: user.id };
  }

  async logout(token: string): Promise<void> {
    await this.cache.del(\`session:\${token}\`);
    this.logger.info('logout', { token });
  }

  async resetPassword(email: string): Promise<void> {
    const user = await this.db.users.findByEmail(email);
    if (!user) return;
    const code = crypto.randomInt(100000, 999999).toString();
    await this.cache.set(\`reset:\${email}\`, code, 900);
    await this.mailer.send({ to: email, subject: 'Password reset', body: code });
    this.logger.info('reset_password', { email });
  }
}
`;

// ─── Fixture: large route table ───────────────────────────────────────────
const ROUTES_ORIGINAL = `\
export const ROUTES = {
  dashboard:  { path: '/dashboard',  method: 'GET',  auth: true,  rate: 100, cache: 60   },
  users:      { path: '/users',      method: 'GET',  auth: true,  rate: 50,  cache: 30   },
  userById:   { path: '/users/:id',  method: 'GET',  auth: true,  rate: 100, cache: 30   },
  createUser: { path: '/users',      method: 'POST', auth: true,  rate: 10,  cache: 0    },
  deleteUser: { path: '/users/:id',  method: 'DEL',  auth: true,  rate: 10,  cache: 0    },
  login:      { path: '/auth/login', method: 'POST', auth: false, rate: 5,   cache: 0    },
  logout:     { path: '/auth/logout',method: 'POST', auth: true,  rate: 100, cache: 0    },
  products:   { path: '/products',   method: 'GET',  auth: false, rate: 200, cache: 3600 },
  productById:{ path: '/products/:id',method:'GET',  auth: false, rate: 200, cache: 3600 },
  orders:     { path: '/orders',     method: 'GET',  auth: true,  rate: 50,  cache: 0    },
} as const;
`;

// ─── Fixture: React component ────────────────────────────────────────────
const COMPONENT_ORIGINAL = `\
import React, { useState, useEffect } from 'react';
import { fetchUser } from '../api/users';

interface Props {
  userId: string;
  onLoad?: () => void;
}

export function UserCard({ userId, onLoad }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser(userId).then((u) => {
      setUser(u);
      setLoading(false);
      onLoad?.();
    });
  }, [userId, onLoad]);

  if (loading) return <div className="skeleton" />;

  return (
    <div className="user-card">
      <img src={user!.avatar} alt={user!.name} />
      <h2>{user!.name}</h2>
      <p>{user!.email}</p>
    </div>
  );
}
`;

// ─── Fixture: SQL migration with many tables ─────────────────────────────
const MIGRATION_ORIGINAL = `\
-- Migration: 2024_01_add_initial_schema
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID NOT NULL REFERENCES orders(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE sessions (
  token      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL
);
`;

// ─── Fixture: long config (30 entries, change 3) ──────────────────────────
const CONFIG_ENTRIES = Array.from(
	{ length: 30 },
	(_, i) => `  FEATURE_${String(i + 1).padStart(2, '0')}: ${i % 3 === 0 ? 'true ' : 'false'},`,
).join('\n');
const CONFIG_ORIGINAL = `export const FEATURE_FLAGS = {\n${CONFIG_ENTRIES}\n} as const;\n`;

// ─── Scenarios ────────────────────────────────────────────────────────────
const SCENARIOS = [
	{
		name: 'class: add method + change constructor param without rewriting unchanged methods',
		original: CLASS_ORIGINAL,
		instruction:
			'I am adding a verifySession method and renaming the cache dep to sessionStore throughout.',
		codeEdit: `\
export class AuthService {
  private readonly db: Database;
  private readonly mailer: Mailer;
  private readonly sessionStore: Cache;
  private readonly logger: Logger;

  constructor(deps: { db: Database; mailer: Mailer; sessionStore: Cache; logger: Logger }) {
    this.db = deps.db;
    this.mailer = deps.mailer;
    this.sessionStore = deps.sessionStore;
    this.logger = deps.logger;
  }

  async login(email: string, password: string): Promise<Session> {
    // ... existing code ...
    await this.sessionStore.set(\`session:\${token}\`, user.id, 86400);
    // ... existing code ...
  }

  async logout(token: string): Promise<void> {
    await this.sessionStore.del(\`session:\${token}\`);
    // ... existing code ...
  }

  // ... existing code ...

  async verifySession(token: string): Promise<string | null> {
    return this.sessionStore.get(\`session:\${token}\`);
  }
}`,
	},
	{
		name: 'table: reorder route table alphabetically + add two new entries',
		original: ROUTES_ORIGINAL,
		instruction:
			'I am reordering ROUTES alphabetically by key and adding a health check and metrics route.',
		codeEdit: `\
export const ROUTES = {
  createUser: { path: '/users',      method: 'POST', auth: true,  rate: 10,  cache: 0    },
  dashboard:  { path: '/dashboard',  method: 'GET',  auth: true,  rate: 100, cache: 60   },
  deleteUser: { path: '/users/:id',  method: 'DEL',  auth: true,  rate: 10,  cache: 0    },
  health:     { path: '/health',     method: 'GET',  auth: false, rate: 1000, cache: 0   },
  login:      { path: '/auth/login', method: 'POST', auth: false, rate: 5,   cache: 0    },
  logout:     { path: '/auth/logout',method: 'POST', auth: true,  rate: 100, cache: 0    },
  metrics:    { path: '/metrics',    method: 'GET',  auth: true,  rate: 10,  cache: 0    },
  orderById:  { path: '/orders/:id', method: 'GET',  auth: true,  rate: 50,  cache: 0    },
  orders:     { path: '/orders',     method: 'GET',  auth: true,  rate: 50,  cache: 0    },
  productById:{ path: '/products/:id',method:'GET',  auth: false, rate: 200, cache: 3600 },
  products:   { path: '/products',   method: 'GET',  auth: false, rate: 200, cache: 3600 },
  userById:   { path: '/users/:id',  method: 'GET',  auth: true,  rate: 100, cache: 30   },
  users:      { path: '/users',      method: 'GET',  auth: true,  rate: 50,  cache: 30   },
} as const;`,
	},
	{
		name: 'react: add error state + skeleton variant without rewriting JSX',
		original: COMPONENT_ORIGINAL,
		instruction:
			'I am adding an error state, an onError prop, and a compact prop that renders a smaller variant.',
		codeEdit: `\
import React, { useState, useEffect } from 'react';
import { fetchUser } from '../api/users';

interface Props {
  userId: string;
  compact?: boolean;
  onLoad?: () => void;
  onError?: (err: Error) => void;
}

export function UserCard({ userId, compact = false, onLoad, onError }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchUser(userId)
      .then((u) => {
        setUser(u);
        setLoading(false);
        onLoad?.();
      })
      .catch((err: Error) => {
        setError(err);
        setLoading(false);
        onError?.(err);
      });
  }, [userId, onLoad, onError]);

  if (loading) return <div className="skeleton" />;
  if (error) return <div className="error">{error.message}</div>;

  if (compact) {
    return (
      <div className="user-card user-card--compact">
        <img src={user!.avatar} alt={user!.name} />
        <span>{user!.name}</span>
      </div>
    );
  }

  // ... existing code ...
}`,
	},
	{
		name: 'sql: add audit columns to every table without rewriting structure',
		original: MIGRATION_ORIGINAL,
		instruction:
			'I am adding updated_at and deleted_at columns to users, products, and orders.',
		codeEdit: `\
-- Migration: 2024_01_add_initial_schema
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE orders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

// ... existing code ...`,
	},
	{
		name: 'sparse: flip 3 feature flags in 30-entry config without retyping others',
		original: CONFIG_ORIGINAL,
		instruction: 'I am enabling FEATURE_05, FEATURE_14, and FEATURE_29.',
		codeEdit: `\
export const FEATURE_FLAGS = {
// ... existing code ...
  FEATURE_05: true ,
// ... existing code ...
  FEATURE_14: true ,
// ... existing code ...
  FEATURE_29: true ,
// ... existing code ...
} as const;`,
	},
] as const;

// ─── Timing ──────────────────────────────────────────────────────────────
const timings = new Map<string, number[]>();

function recordMs(name: string, ms: number) {
	if (!timings.has(name)) timings.set(name, []);
	timings.get(name)!.push(ms);
}

// ─── Core helper ─────────────────────────────────────────────────────────
async function applyAndCheck(
	original: string,
	instruction: string,
	codeEdit: string,
	scenarioName: string,
): Promise<string> {
	const t0 = performance.now();
	const result = await applyEdit({ originalCode: original, codeEdit, instruction, morphApiKey: apiKey! });
	recordMs(scenarioName, Math.round(performance.now() - t0));

	if (!result.success || !result.mergedCode) {
		throw new Error(`applyEdit failed: ${result.error}`);
	}
	expect(
		result.mergedCode,
		`Unexpanded marker leaked into output — model failed to expand a placeholder`,
	).not.toContain('// ... existing');
	return result.mergedCode;
}

// ─── Suite ───────────────────────────────────────────────────────────────
describe.skipIf(!apiKey)('quick_edit live: marker expansion', () => {
	afterAll(() => {
		console.log('\nTiming per scenario (all runs; run 1 = cold):\n');
		for (const [name, runs] of timings) {
			const [cold, ...warm] = runs;
			const sorted = [...warm].sort((a, b) => a - b);
			const median = sorted[Math.floor(sorted.length / 2)] ?? cold;
			console.log(`  ${name}`);
			console.log(`    runs: [${runs.join(', ')}] ms`);
			console.log(`    cold: ${cold}ms   warm median: ${median}ms`);
		}
	});

	test.each(SCENARIOS)('$name', async ({ name, original, instruction, codeEdit }) => {
		for (let i = 0; i < RUNS; i++) {
			const merged = await applyAndCheck(original, instruction, codeEdit, name);

			// Lock exact output on first run; subsequent runs must match the same snapshot.
			// Update with: pnpm run test:quick-edit-live -- --update-snapshots
			expect(merged).toMatchSnapshot();
		}
	}, 120_000);
});
