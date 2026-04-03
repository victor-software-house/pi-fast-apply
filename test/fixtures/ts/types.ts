/**
 * Advanced TypeScript type utilities used across the platform.
 *
 * Scenario target (type edit):
 *  - Add a new `StrictRecord<K, V>` utility type after `DeepReadonly`
 *  - Change `Paginated<T>` to include a `nextCursor` field alongside `offset`
 *  - Extend `ApiResponse<T>` discriminated union with a new `'rate-limited'` variant
 */

// ---------------------------------------------------------------------------
// Primitive constraints
// ---------------------------------------------------------------------------

/** Any JSON-serializable value. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Branded nominal type — prevents mixing structurally identical primitives. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, 'UserId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type TraceId = Brand<string, 'TraceId'>;
export type UnixMs = Brand<number, 'UnixMs'>;

// ---------------------------------------------------------------------------
// Deep utilities
// ---------------------------------------------------------------------------

/** Recursively make all properties readonly. */
export type DeepReadonly<T> = T extends (infer U)[]
	? ReadonlyArray<DeepReadonly<U>>
	: T extends object
		? { readonly [K in keyof T]: DeepReadonly<T[K]> }
		: T;

/** Recursively make all properties optional. */
export type DeepPartial<T> = T extends object
	? { [K in keyof T]?: DeepPartial<T[K]> }
	: T;

/** Recursively make all properties required and non-nullable. */
export type DeepRequired<T> = T extends object
	? { [K in keyof T]-?: DeepRequired<NonNullable<T[K]>> }
	: NonNullable<T>;

// ---------------------------------------------------------------------------
// Object utilities
// ---------------------------------------------------------------------------

/** Keys of T whose values extend V. */
export type KeysOfType<T, V> = {
	[K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/** Omit all keys whose values extend V. */
export type OmitByType<T, V> = Omit<T, KeysOfType<T, V>>;

/** Pick all keys whose values extend V. */
export type PickByType<T, V> = Pick<T, KeysOfType<T, V>>;

/** Make a subset of keys optional. */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Make a subset of keys required. */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

/** Merge two object types, with B's properties overriding A's. */
export type Merge<A, B> = Omit<A, keyof B> & B;

// ---------------------------------------------------------------------------
// Function utilities
// ---------------------------------------------------------------------------

export type AsyncFn<Args extends unknown[], R> = (...args: Args) => Promise<R>;
export type MaybePromise<T> = T | Promise<T>;
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/** Extract the first argument type of a function. */
export type FirstArg<F> = F extends (first: infer A, ...rest: unknown[]) => unknown ? A : never;

// ---------------------------------------------------------------------------
// Discriminated unions
// ---------------------------------------------------------------------------

export type Result<T, E = Error> =
	| { ok: true; value: T }
	| { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
	return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
	return { ok: false, error };
}

export function unwrap<T>(result: Result<T>): T {
	if (!result.ok) throw result.error;
	return result.value;
}

// ---------------------------------------------------------------------------
// API response envelope
// ---------------------------------------------------------------------------

/**
 * Discriminated union for all possible API response shapes.
 * Consumers narrow by checking `status`.
 */
export type ApiResponse<T> =
	| { status: 'ok'; data: T; requestId: string }
	| { status: 'error'; code: string; message: string; requestId: string }
	| { status: 'not-found'; resource: string; requestId: string }
	| { status: 'unauthorized'; reason: string; requestId: string };

export function isOk<T>(res: ApiResponse<T>): res is Extract<ApiResponse<T>, { status: 'ok' }> {
	return res.status === 'ok';
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface Paginated<T> {
	items: T[];
	/** Zero-based offset of the first item in this page. */
	offset: number;
	limit: number;
	total: number;
	hasMore: boolean;
}

export function emptyPage<T>(): Paginated<T> {
	return { items: [], offset: 0, limit: 0, total: 0, hasMore: false };
}

// ---------------------------------------------------------------------------
// Event system
// ---------------------------------------------------------------------------

export type EventMap = Record<string, unknown>;

export type EventHandler<T> = (payload: T) => void | Promise<void>;

export interface TypedEmitter<Events extends EventMap> {
	on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void;
	off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void;
	emit<K extends keyof Events>(event: K, payload: Events[K]): void;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface Validator<T> {
	parse(input: unknown): T;
	safeParse(input: unknown): Result<T, { issues: ValidationIssue[] }>;
}

export interface ValidationIssue {
	path: (string | number)[];
	message: string;
	code: string;
}

/** Infer the output type of a Validator. */
export type Infer<V> = V extends Validator<infer T> ? T : never;
