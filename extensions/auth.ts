import type { AuthStorage } from '@earendil-works/pi-coding-agent';
import { MORPH_ENV_VAR, MORPH_PROVIDER_ID } from './constants';

export type MorphAuthSource = 'auth.json' | 'env' | 'none';

export interface MorphAuthResolution {
	key: string;
	source: MorphAuthSource;
}

export async function resolveMorphApiKey(authStorage: AuthStorage): Promise<MorphAuthResolution> {
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

export function morphAuthSourceLabel(source: MorphAuthSource): string {
	if (source === 'auth.json') return 'auth.json (via /morph-login)';
	if (source === 'env') return 'MORPH_API_KEY environment variable';
	return 'not configured';
}
