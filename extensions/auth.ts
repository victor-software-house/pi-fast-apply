import type { AuthStorage } from '@mariozechner/pi-coding-agent';

const DEFAULT_MORPH_API_URL = 'https://api.morphllm.com';

/**
 * Provider identifier used as the auth.json key for Morph credentials.
 * Pi's built-in env var mapping does not include Morph, so we resolve
 * MORPH_API_KEY explicitly as a fallback after checking authStorage.
 */
export const MORPH_PROVIDER_ID = 'morph';
export const MORPH_ENV_VAR = 'MORPH_API_KEY';

/**
 * Auth source for operator-visible diagnostics.
 */
export type MorphAuthSource = 'auth.json' | 'env' | 'none';

/**
 * Resolve the Morph API key using Pi's auth priority chain:
 *   1. authStorage (runtime override or auth.json via /morph-login)
 *   2. MORPH_API_KEY environment variable
 *
 * Pi's built-in getEnvApiKey() hardcodes known providers and does not
 * include 'morph', so step 2 is an explicit env-var check rather than
 * relying on authStorage's env fallback.
 */
export async function resolveMorphApiKey(authStorage: AuthStorage): Promise<{ key: string; source: MorphAuthSource }> {
	const storedKey = await authStorage.getApiKey(MORPH_PROVIDER_ID, { includeFallback: false });
	if (storedKey != null && storedKey !== '') {
		return { key: storedKey, source: 'auth.json' };
	}

	const envKey = process.env[MORPH_ENV_VAR]?.trim();
	if (envKey != null && envKey !== '') {
		return { key: envKey, source: 'env' };
	}

	return { key: '', source: 'none' };
}

/**
 * Resolve and require a Morph API key, throwing a descriptive error when missing.
 */
export async function ensureMorphApiKey(authStorage: AuthStorage): Promise<string> {
	const { key, source } = await resolveMorphApiKey(authStorage);
	if (source === 'none') {
		throw new Error(
			'Morph API key is not configured.\n' +
				'Use /morph-login to store a key in Pi, or set MORPH_API_KEY in the environment.',
		);
	}
	return key;
}

export function getMorphApiBaseUrl(): string {
	const configuredBaseUrl = process.env['MORPH_API_URL']?.trim();
	const raw = configuredBaseUrl == null || configuredBaseUrl === '' ? DEFAULT_MORPH_API_URL : configuredBaseUrl;
	return raw.replace(/\/+$/, '').replace(/\/v1$/, '');
}
