/**
 * AuthService — JWT-based authentication with refresh-token rotation.
 *
 * Design notes:
 *  - Access tokens are short-lived (15 min), signed with HS256 for simplicity.
 *  - Refresh tokens are opaque 32-byte hex strings stored server-side.
 *  - Token rotation: every refresh call invalidates the old token and issues
 *    a new one. Reuse of a revoked token triggers full user session wipeout.
 *  - Passwords are never stored; the caller provides a `verifyCredentials`
 *    hook that delegates to the real user store.
 *
 * Scenario target: edit the `refresh` method to add rate-limiting logic,
 * and change ACCESS_TOKEN_TTL_MS from 15 min to 5 min.
 *
 * @module auth-service
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const JWT_ALGORITHM = 'HS256' as const;

/** Access token lifetime in milliseconds. */
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;   // 15 minutes

/** Refresh token lifetime in milliseconds. */
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

/** Hard cap on simultaneous live sessions per user. */
export const MAX_SESSIONS_PER_USER = 5;

/** Minimum password length enforced at registration. */
export const MIN_PASSWORD_LENGTH = 12;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Role = 'guest' | 'viewer' | 'editor' | 'admin' | 'superadmin';

export interface TokenPair {
	accessToken: string;
	refreshToken: string;
	/** Unix ms timestamp when the access token expires. */
	expiresAt: number;
}

export interface SessionRecord {
	sessionId: string;
	userId: string;
	role: Role;
	/** HMAC of (sessionId + createdAt) — never the raw token. */
	tokenHmac: string;
	createdAt: number;
	lastUsedAt: number;
	expiresAt: number;
	/** Client IP at session creation, for audit purposes. */
	originIp: string;
	userAgent: string;
	revoked: boolean;
}

export interface AuthContext {
	userId: string;
	sessionId: string;
	role: Role;
	/** Expiry as Unix ms timestamp. */
	exp: number;
}

export interface AuthError {
	code:
		| 'INVALID_CREDENTIALS'
		| 'TOKEN_EXPIRED'
		| 'TOKEN_INVALID'
		| 'SESSION_REVOKED'
		| 'SESSION_LIMIT_EXCEEDED'
		| 'INSUFFICIENT_PERMISSIONS'
		| 'INTERNAL_ERROR';
	message: string;
}

export interface LoginMeta {
	ip: string;
	userAgent: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken(byteLength = 32): string {
	return randomBytes(byteLength).toString('hex');
}

function generateSessionId(): string {
	return `sess_${generateToken(16)}`;
}

function hmacSha256(payload: string, key: string): string {
	return createHmac('sha256', key).update(payload).digest('hex');
}

/** Constant-time string comparison to prevent timing side-channels. */
function safeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		// Still run to avoid leaking length via timing
		timingSafeEqual(Buffer.alloc(1), Buffer.alloc(1));
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

const ROLE_ORDER: Role[] = ['guest', 'viewer', 'editor', 'admin', 'superadmin'];

function roleAtLeast(actual: Role, required: Role): boolean {
	return ROLE_ORDER.indexOf(actual) >= ROLE_ORDER.indexOf(required);
}

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

export class SessionStore {
	private readonly sessions = new Map<string, SessionRecord>();
	private readonly persistPath: string | null;
	private readonly hmacKey: string;

	constructor(options: { persistPath?: string; hmacKey: string }) {
		this.persistPath = options.persistPath ?? null;
		this.hmacKey = options.hmacKey;
	}

	async hydrate(): Promise<void> {
		if (this.persistPath == null) return;
		try {
			const raw = await readFile(this.persistPath, 'utf8');
			const records = JSON.parse(raw) as SessionRecord[];
			for (const record of records) {
				this.sessions.set(record.sessionId, record);
			}
		} catch {
			// File missing or corrupt — start fresh
		}
	}

	async flush(): Promise<void> {
		if (this.persistPath == null) return;
		const data = JSON.stringify(Array.from(this.sessions.values()), null, 2);
		await writeFile(this.persistPath, data, 'utf8');
	}

	get(sessionId: string): SessionRecord | null {
		return this.sessions.get(sessionId) ?? null;
	}

	set(record: SessionRecord): void {
		this.sessions.set(record.sessionId, record);
	}

	revoke(sessionId: string): boolean {
		const record = this.sessions.get(sessionId);
		if (record == null) return false;
		record.revoked = true;
		record.lastUsedAt = Date.now();
		return true;
	}

	revokeAllForUser(userId: string): number {
		let count = 0;
		for (const record of this.sessions.values()) {
			if (record.userId === userId && !record.revoked) {
				record.revoked = true;
				count++;
			}
		}
		return count;
	}

	purge(): number {
		const now = Date.now();
		let removed = 0;
		for (const [id, record] of this.sessions) {
			if (record.revoked || record.expiresAt < now) {
				this.sessions.delete(id);
				removed++;
			}
		}
		return removed;
	}

	activeCountForUser(userId: string): number {
		const now = Date.now();
		let count = 0;
		for (const record of this.sessions.values()) {
			if (record.userId === userId && !record.revoked && record.expiresAt >= now) {
				count++;
			}
		}
		return count;
	}

	validateRefreshToken(sessionId: string, token: string): boolean {
		const record = this.sessions.get(sessionId);
		if (record == null || record.revoked) return false;
		if (record.expiresAt < Date.now()) return false;
		const expected = hmacSha256(sessionId + record.createdAt.toString(), this.hmacKey);
		return safeCompare(token, expected);
	}

	all(): SessionRecord[] {
		return Array.from(this.sessions.values());
	}
}

// ---------------------------------------------------------------------------
// Auth service
// ---------------------------------------------------------------------------

export interface AuthServiceOptions {
	store: SessionStore;
	/** Must return { userId, role } on success, null on bad credentials. */
	verifyCredentials: (username: string, password: string) => Promise<{ userId: string; role: Role } | null>;
	hmacKey: string;
}

export class AuthService {
	private readonly store: SessionStore;
	private readonly verifyCredentials: AuthServiceOptions['verifyCredentials'];
	private readonly hmacKey: string;

	constructor(options: AuthServiceOptions) {
		this.store = options.store;
		this.verifyCredentials = options.verifyCredentials;
		this.hmacKey = options.hmacKey;
	}

	/**
	 * Authenticate with username + password.
	 * Returns a TokenPair on success or an AuthError on failure.
	 */
	async login(username: string, password: string, meta: LoginMeta): Promise<TokenPair | AuthError> {
		const identity = await this.verifyCredentials(username, password);
		if (identity == null) {
			return { code: 'INVALID_CREDENTIALS', message: 'Username or password is incorrect.' };
		}

		const active = this.store.activeCountForUser(identity.userId);
		if (active >= MAX_SESSIONS_PER_USER) {
			return {
				code: 'SESSION_LIMIT_EXCEEDED',
				message: `Maximum of ${MAX_SESSIONS_PER_USER} concurrent sessions reached.`,
			};
		}

		return this.#issue(identity.userId, identity.role, meta);
	}

	/**
	 * Rotate a refresh token.
	 * Revokes the old session and issues a new TokenPair.
	 * If the old token is already revoked, all user sessions are wiped
	 * (refresh-token reuse = theft signal).
	 */
	async refresh(sessionId: string, refreshToken: string, meta: LoginMeta): Promise<TokenPair | AuthError> {
		const record = this.store.get(sessionId);
		if (record == null) {
			return { code: 'TOKEN_INVALID', message: 'Session not found.' };
		}

		if (record.revoked) {
			// Reuse of a revoked token — treat as a compromise signal
			this.store.revokeAllForUser(record.userId);
			return { code: 'SESSION_REVOKED', message: 'Token reuse detected. All sessions have been revoked.' };
		}

		if (!this.store.validateRefreshToken(sessionId, refreshToken)) {
			return { code: 'TOKEN_INVALID', message: 'Refresh token is invalid or expired.' };
		}

		// Invalidate the consumed token before issuing a new one
		this.store.revoke(sessionId);
		return this.#issue(record.userId, record.role, meta);
	}

	/**
	 * Verify an access token (Bearer format).
	 * Returns AuthContext on success or AuthError on failure.
	 */
	verify(accessToken: string): AuthContext | AuthError {
		const parts = accessToken.split('.');
		if (parts.length !== 3) {
			return { code: 'TOKEN_INVALID', message: 'Malformed access token.' };
		}

		const [headerB64, payloadB64, sig] = parts as [string, string, string];
		const expected = hmacSha256(`${headerB64}.${payloadB64}`, this.hmacKey);

		if (!safeCompare(sig, expected)) {
			return { code: 'TOKEN_INVALID', message: 'Token signature is invalid.' };
		}

		let ctx: AuthContext;
		try {
			ctx = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as AuthContext;
		} catch {
			return { code: 'TOKEN_INVALID', message: 'Token payload is corrupt.' };
		}

		if (ctx.exp < Date.now()) {
			return { code: 'TOKEN_EXPIRED', message: 'Access token has expired.' };
		}

		return ctx;
	}

	requireRole(ctx: AuthContext, minRole: Role): AuthError | null {
		if (!roleAtLeast(ctx.role, minRole)) {
			return {
				code: 'INSUFFICIENT_PERMISSIONS',
				message: `Requires '${minRole}' role or higher.`,
			};
		}
		return null;
	}

	logout(sessionId: string): boolean {
		return this.store.revoke(sessionId);
	}

	// -------------------------------------------------------------------------
	// Private
	// -------------------------------------------------------------------------

	#issue(userId: string, role: Role, meta: LoginMeta): TokenPair {
		const now = Date.now();
		const sessionId = generateSessionId();
		const tokenHmac = hmacSha256(sessionId + now.toString(), this.hmacKey);

		this.store.set({
			sessionId,
			userId,
			role,
			tokenHmac,
			createdAt: now,
			lastUsedAt: now,
			expiresAt: now + REFRESH_TOKEN_TTL_MS,
			originIp: meta.ip,
			userAgent: meta.userAgent,
			revoked: false,
		});

		const headerB64 = Buffer.from(JSON.stringify({ alg: JWT_ALGORITHM, typ: 'JWT' })).toString('base64url');
		const payload: AuthContext = { userId, sessionId, role, exp: now + ACCESS_TOKEN_TTL_MS };
		const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
		const sig = hmacSha256(`${headerB64}.${payloadB64}`, this.hmacKey);

		return {
			accessToken: `${headerB64}.${payloadB64}.${sig}`,
			refreshToken: tokenHmac,
			expiresAt: now + ACCESS_TOKEN_TTL_MS,
		};
	}
}
