/**
 * Platform runtime configuration.
 *
 * All values fall back to safe defaults when the corresponding env var
 * is absent. The config is frozen at startup and never mutated at runtime.
 *
 * Scenario target (deeply nested edit):
 *  - Change `database.pool.max` from 10 to 20
 *  - Add a `database.pool.idleTimeoutMs` field (default: 30_000)
 *  - Change `cache.ttl.session` from 900 to 1800
 *  - Add a top-level `flags.enableBetaFeatures` boolean (default: false)
 */

function env(key: string, fallback: string): string {
	return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
	const raw = process.env[key];
	if (raw == null) return fallback;
	const n = parseInt(raw, 10);
	return Number.isFinite(n) ? n : fallback;
}

function envBool(key: string, fallback: boolean): boolean {
	const raw = process.env[key];
	if (raw == null) return fallback;
	return raw === '1' || raw.toLowerCase() === 'true';
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export const server = {
	host: env('HOST', '0.0.0.0'),
	port: envInt('PORT', 3000),
	/** Maximum request body size in bytes. */
	bodySizeLimit: envInt('BODY_SIZE_LIMIT', 1_048_576), // 1 MiB
	/** Backlog queue size for the TCP server. */
	backlog: envInt('SERVER_BACKLOG', 512),
	trustProxy: envBool('TRUST_PROXY', false),
	/** Graceful shutdown timeout — how long to wait for in-flight requests. */
	shutdownTimeoutMs: envInt('SHUTDOWN_TIMEOUT_MS', 10_000),
} as const;

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export const database = {
	url: env('DATABASE_URL', 'postgres://localhost:5432/platform'),
	/** Schema to use for all queries. */
	schema: env('DATABASE_SCHEMA', 'public'),
	pool: {
		min: envInt('DB_POOL_MIN', 2),
		max: envInt('DB_POOL_MAX', 10),
		/** How long (ms) a checkout attempt waits before throwing. */
		acquireTimeoutMs: envInt('DB_ACQUIRE_TIMEOUT_MS', 5_000),
	},
	/** Enable verbose query logging (very noisy — dev only). */
	debugLog: envBool('DATABASE_DEBUG', false),
	/** SSL mode for the database connection. */
	ssl: env('DATABASE_SSL', 'prefer') as 'disable' | 'allow' | 'prefer' | 'require',
	migrations: {
		/** Directory containing migration files, relative to the project root. */
		dir: env('MIGRATIONS_DIR', 'db/migrations'),
		/** Table where migration state is tracked. */
		table: env('MIGRATIONS_TABLE', 'schema_migrations'),
		/** Run pending migrations automatically on startup. */
		runOnStartup: envBool('MIGRATE_ON_STARTUP', false),
	},
} as const;

// ---------------------------------------------------------------------------
// Cache (Redis)
// ---------------------------------------------------------------------------

export const cache = {
	url: env('REDIS_URL', 'redis://localhost:6379'),
	/** Key prefix for all cache entries — isolates environments sharing a Redis. */
	keyPrefix: env('CACHE_KEY_PREFIX', 'platform:'),
	/** Whether to enable Redis cluster mode. */
	cluster: envBool('REDIS_CLUSTER', false),
	ttl: {
		/** Default TTL for generic cache entries, in seconds. */
		default: envInt('CACHE_TTL_DEFAULT', 60),
		/** TTL for authenticated session data, in seconds. */
		session: envInt('CACHE_TTL_SESSION', 900),   // 15 minutes
		/** TTL for rate-limiter windows, in seconds. */
		rateLimit: envInt('CACHE_TTL_RATE_LIMIT', 60),
		/** TTL for feature-flag values, in seconds. */
		featureFlags: envInt('CACHE_TTL_FLAGS', 300),
	},
	/** Maximum number of retry attempts on connection failure. */
	maxRetries: envInt('REDIS_MAX_RETRIES', 3),
} as const;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const auth = {
	/** Secret used for HMAC signing of access and refresh tokens. */
	hmacSecret: env('AUTH_HMAC_SECRET', 'change-me-in-production'),
	accessTokenTtlMs: envInt('ACCESS_TOKEN_TTL_MS', 15 * 60 * 1_000),
	refreshTokenTtlMs: envInt('REFRESH_TOKEN_TTL_MS', 7 * 24 * 60 * 60 * 1_000),
	maxSessionsPerUser: envInt('MAX_SESSIONS_PER_USER', 5),
	bcryptRounds: envInt('BCRYPT_ROUNDS', 12),
	/** CORS origins that are allowed to send credentialed requests. */
	allowedOrigins: env('ALLOWED_ORIGINS', 'http://localhost:5173').split(',').map((s) => s.trim()),
} as const;

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

export const observability = {
	logLevel: env('LOG_LEVEL', 'info') as 'debug' | 'info' | 'warn' | 'error',
	/** Whether to emit structured JSON logs (off → pretty-print for dev). */
	jsonLogs: envBool('JSON_LOGS', false),
	/** Service name emitted in every log line and trace span. */
	serviceName: env('SERVICE_NAME', 'platform-api'),
	tracing: {
		enabled: envBool('TRACING_ENABLED', false),
		endpoint: env('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318'),
		/** Sample rate: 0.0 – 1.0 */
		sampleRate: parseFloat(env('TRACING_SAMPLE_RATE', '0.1')),
	},
	metrics: {
		enabled: envBool('METRICS_ENABLED', false),
		/** Port for the Prometheus /metrics endpoint. */
		port: envInt('METRICS_PORT', 9090),
		/** Path for the metrics endpoint. */
		path: env('METRICS_PATH', '/metrics'),
	},
} as const;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const storage = {
	provider: env('STORAGE_PROVIDER', 'local') as 'local' | 's3' | 'gcs',
	local: {
		/** Root directory for file uploads when provider is 'local'. */
		root: env('STORAGE_LOCAL_ROOT', '/var/platform/uploads'),
		/** Max file upload size in bytes. */
		maxFileSize: envInt('STORAGE_MAX_FILE_SIZE', 10 * 1_048_576), // 10 MiB
	},
	s3: {
		bucket: env('S3_BUCKET', ''),
		region: env('S3_REGION', 'us-east-1'),
		endpoint: env('S3_ENDPOINT', ''), // empty = AWS default
		forcePathStyle: envBool('S3_FORCE_PATH_STYLE', false),
	},
} as const;

// ---------------------------------------------------------------------------
// Feature flags (static / env-driven)
// ---------------------------------------------------------------------------

export const flags = {
	enableRegistration: envBool('FLAG_ENABLE_REGISTRATION', true),
	enableOAuth: envBool('FLAG_ENABLE_OAUTH', false),
	maintenanceMode: envBool('FLAG_MAINTENANCE_MODE', false),
} as const;

// ---------------------------------------------------------------------------
// Assembled config export
// ---------------------------------------------------------------------------

const config = { server, database, cache, auth, observability, storage, flags } as const;
export type Config = typeof config;
export default config;
