/**
 * HTTP API client with retry logic, circuit-breaker, and request deduplication.
 *
 * Scenario target (scattered edits):
 *  - Change DEFAULT_TIMEOUT_MS from 8000 to 12000
 *  - Add a `cache` option to RequestOptions
 *  - Update `buildHeaders` to include an X-Request-ID header
 *  - Change the circuit-breaker threshold from 5 to 3 failures
 *
 * All four changes are in completely different regions of the file —
 * ideal for a single morph_edit call with markers.
 */

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Default request timeout in ms. Applies to every method unless overridden. */
export const DEFAULT_TIMEOUT_MS = 8_000;

/** How many times to retry a failed request before giving up. */
export const DEFAULT_MAX_RETRIES = 3;

/** Base delay (ms) for exponential backoff. Doubles on each retry. */
export const RETRY_BASE_DELAY_MS = 200;

/** Circuit-breaker opens after this many consecutive failures. */
export const CIRCUIT_BREAKER_THRESHOLD = 5;

/** Circuit-breaker stays open for this many ms before attempting a probe. */
export const CIRCUIT_BREAKER_RESET_MS = 30_000;

/** Default content-type for POST/PUT/PATCH bodies. */
export const DEFAULT_CONTENT_TYPE = 'application/json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface RequestOptions {
	method?: HttpMethod;
	headers?: Record<string, string>;
	body?: unknown;
	timeout?: number;
	retries?: number;
	/** If true, identical in-flight GET requests are collapsed into one. */
	deduplicate?: boolean;
	signal?: AbortSignal;
}

export interface ApiResponse<T = unknown> {
	status: number;
	headers: Record<string, string>;
	data: T;
	/** Total time from request start to response completion in ms. */
	durationMs: number;
}

export interface ApiError {
	code: 'NETWORK_ERROR' | 'TIMEOUT' | 'CIRCUIT_OPEN' | 'HTTP_ERROR' | 'PARSE_ERROR';
	status?: number;
	message: string;
	retries: number;
}

type CircuitState = 'closed' | 'open' | 'half-open';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number): boolean {
	// Retry on server errors and specific transient client errors
	return status >= 500 || status === 429 || status === 408;
}

function backoffMs(attempt: number, base: number): number {
	// Exponential backoff with ±10% jitter
	const exp = base * 2 ** attempt;
	const jitter = exp * 0.1 * (Math.random() * 2 - 1);
	return Math.round(exp + jitter);
}

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return {
		'Content-Type': DEFAULT_CONTENT_TYPE,
		Accept: 'application/json',
		...extra,
	};
}

function parseHeaders(raw: Headers): Record<string, string> {
	const result: Record<string, string> = {};
	raw.forEach((value, key) => {
		result[key] = value;
	});
	return result;
}

async function parseBody<T>(res: Response): Promise<T> {
	const ct = res.headers.get('content-type') ?? '';
	if (ct.includes('application/json')) {
		return res.json() as Promise<T>;
	}
	return res.text() as unknown as T;
}

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

class CircuitBreaker {
	private state: CircuitState = 'closed';
	private failures = 0;
	private lastFailureAt = 0;

	get isOpen(): boolean {
		if (this.state === 'open') {
			// Check if reset window has elapsed — if so, allow a probe
			if (Date.now() - this.lastFailureAt >= CIRCUIT_BREAKER_RESET_MS) {
				this.state = 'half-open';
				return false;
			}
			return true;
		}
		return false;
	}

	recordSuccess(): void {
		this.state = 'closed';
		this.failures = 0;
	}

	recordFailure(): void {
		this.failures++;
		this.lastFailureAt = Date.now();
		if (this.failures >= CIRCUIT_BREAKER_THRESHOLD) {
			this.state = 'open';
		}
	}

	get status(): CircuitState {
		return this.state;
	}
}

// ---------------------------------------------------------------------------
// In-flight request deduplication
// ---------------------------------------------------------------------------

class InflightRegistry {
	private readonly pending = new Map<string, Promise<Response>>();

	key(url: string, method: HttpMethod): string {
		return `${method}:${url}`;
	}

	get(key: string): Promise<Response> | undefined {
		return this.pending.get(key);
	}

	register(key: string, promise: Promise<Response>): void {
		this.pending.set(key, promise);
		// Clean up once the promise settles
		promise.finally(() => this.pending.delete(key));
	}
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

export class ApiClient {
	private readonly baseUrl: string;
	private readonly defaultHeaders: Record<string, string>;
	private readonly circuit: CircuitBreaker;
	private readonly inflight: InflightRegistry;

	constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
		// Strip trailing slash for clean URL composition
		this.baseUrl = baseUrl.replace(/\/+$/, '');
		this.defaultHeaders = defaultHeaders;
		this.circuit = new CircuitBreaker();
		this.inflight = new InflightRegistry();
	}

	async get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
		return this.request<T>(path, { ...options, method: 'GET' });
	}

	async post<T>(path: string, body: unknown, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
		return this.request<T>(path, { ...options, method: 'POST', body });
	}

	async put<T>(path: string, body: unknown, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
		return this.request<T>(path, { ...options, method: 'PUT', body });
	}

	async patch<T>(path: string, body: unknown, options: Omit<RequestOptions, 'method'> = {}): Promise<ApiResponse<T>> {
		return this.request<T>(path, { ...options, method: 'PATCH', body });
	}

	async delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
		return this.request<T>(path, { ...options, method: 'DELETE' });
	}

	/** Return current circuit-breaker state for health checks / observability. */
	circuitStatus(): CircuitState {
		return this.circuit.status;
	}

	// -------------------------------------------------------------------------
	// Core request method
	// -------------------------------------------------------------------------

	async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
		if (this.circuit.isOpen) {
			throw { code: 'CIRCUIT_OPEN', message: 'Circuit breaker is open.', retries: 0 } satisfies ApiError;
		}

		const url = `${this.baseUrl}${path}`;
		const method = options.method ?? 'GET';
		const maxRetries = options.retries ?? DEFAULT_MAX_RETRIES;
		const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
		const headers = buildHeaders({ ...this.defaultHeaders, ...(options.headers ?? {}) });

		// Deduplication: collapse concurrent GET requests with the same URL
		if (method === 'GET' && options.deduplicate !== false) {
			const key = this.inflight.key(url, method);
			const pending = this.inflight.get(key);
			if (pending != null) {
				// Reuse the in-flight response — clone so each consumer gets their own body reader
				const res = await pending;
				return this.#processResponse<T>(res.clone(), url, 0);
			}
		}

		let lastError: ApiError | null = null;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (attempt > 0) {
				await sleep(backoffMs(attempt - 1, RETRY_BASE_DELAY_MS));
			}

			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeout);
			const combinedSignal = options.signal != null
				? AbortSignal.any([options.signal, controller.signal])
				: controller.signal;

			try {
				const fetchPromise = fetch(url, {
					method,
					headers,
					body: options.body != null ? JSON.stringify(options.body) : undefined,
					signal: combinedSignal,
				});

				// Register for deduplication on GET
				if (method === 'GET' && options.deduplicate !== false) {
					this.inflight.register(this.inflight.key(url, method), fetchPromise);
				}

				const res = await fetchPromise;
				clearTimeout(timer);

				if (!res.ok && isRetryable(res.status) && attempt < maxRetries) {
					lastError = { code: 'HTTP_ERROR', status: res.status, message: res.statusText, retries: attempt };
					this.circuit.recordFailure();
					continue;
				}

				this.circuit.recordSuccess();
				return await this.#processResponse<T>(res, url, attempt);
			} catch (err) {
				clearTimeout(timer);
				const isTimeout = err instanceof Error && err.name === 'AbortError';
				lastError = {
					code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
					message: err instanceof Error ? err.message : String(err),
					retries: attempt,
				};
				this.circuit.recordFailure();
			}
		}

		throw lastError ?? { code: 'NETWORK_ERROR', message: 'Unknown error', retries: maxRetries };
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	async #processResponse<T>(res: Response, url: string, retries: number): Promise<ApiResponse<T>> {
		const start = Date.now();
		let data: T;

		try {
			data = await parseBody<T>(res);
		} catch {
			throw { code: 'PARSE_ERROR', status: res.status, message: `Failed to parse response from ${url}`, retries } satisfies ApiError;
		}

		if (!res.ok) {
			throw { code: 'HTTP_ERROR', status: res.status, message: res.statusText, retries } satisfies ApiError;
		}

		return {
			status: res.status,
			headers: parseHeaders(res.headers),
			data,
			durationMs: Date.now() - start,
		};
	}
}
