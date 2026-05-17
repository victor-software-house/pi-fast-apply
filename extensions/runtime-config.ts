import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { ApplyEditConfig } from '@morphllm/morphsdk';
import {
	CUSTOM_MORPH_API_URL_OPT_IN,
	DEFAULT_MORPH_API_HOST,
	DEFAULT_MORPH_API_URL,
	DEFAULT_TIMEOUT_MS,
	MORPH_APPLY_DEFAULT_MODEL,
	MORPH_APPLY_MODEL_TYPE_MARKER,
	MORPH_SDK_PACKAGE,
} from './constants';

const moduleRequire = createRequire(import.meta.url);

export type MorphConfigSource = 'default' | 'env';
export type MorphApplyDefaultModel = typeof MORPH_APPLY_DEFAULT_MODEL;
export type MorphSdkPatchStatus = 'auto-default-available' | 'auto-default-not-detected' | 'unknown';

export interface MorphSdkPatchInfo {
	packageName: string;
	version: string;
	status: MorphSdkPatchStatus;
	detail: string;
}

export interface MorphRuntimeConfig {
	apiBaseUrl: string;
	displayApiBaseUrl: string;
	apiBaseUrlSource: MorphConfigSource;
	apiBaseUrlHost: string;
	apiBaseUrlCustomHost: boolean;
	timeoutMs: number;
	timeoutSource: MorphConfigSource;
	applyDefaultModel: MorphApplyDefaultModel;
	sdkPatch: MorphSdkPatchInfo;
}

let cachedRuntimeConfig: Promise<MorphRuntimeConfig> | undefined;

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (value == null || value.trim() === '') return fallback;

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveMorphApiBaseUrl(): {
	value: string;
	displayValue: string;
	source: MorphConfigSource;
	host: string;
	customHost: boolean;
} {
	const configuredBaseUrl = process.env['MORPH_API_URL']?.trim();
	const source: MorphConfigSource = configuredBaseUrl == null || configuredBaseUrl === '' ? 'default' : 'env';
	const raw = source === 'default' ? DEFAULT_MORPH_API_URL : (configuredBaseUrl ?? DEFAULT_MORPH_API_URL);
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error('MORPH_API_URL must be a valid absolute URL.');
	}

	if (url.protocol !== 'https:') throw new Error('MORPH_API_URL must use https.');
	if (url.username !== '' || url.password !== '')
		throw new Error('MORPH_API_URL must not include embedded credentials.');
	if (url.search !== '' || url.hash !== '')
		throw new Error('MORPH_API_URL must not include query strings or fragments.');

	const customHost = url.hostname !== DEFAULT_MORPH_API_HOST;
	if (customHost && process.env[CUSTOM_MORPH_API_URL_OPT_IN] !== '1') {
		throw new Error(
			`Refusing custom MORPH_API_URL host '${url.hostname}'. ` +
				`Set ${CUSTOM_MORPH_API_URL_OPT_IN}=1 only for trusted test endpoints.`,
		);
	}

	url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
	const value = url.toString().replace(/\/$/, '');
	return { value, displayValue: value, source, host: url.hostname, customHost };
}

function resolveMorphTimeout(): { value: number; source: MorphConfigSource } {
	const configuredTimeout = process.env['MORPH_EDIT_TIMEOUT_MS']?.trim();
	return {
		value: parsePositiveInt(configuredTimeout, DEFAULT_TIMEOUT_MS),
		source: configuredTimeout == null || configuredTimeout === '' ? 'default' : 'env',
	};
}

function readJsonStringField(rawJson: string, fieldName: string): string | undefined {
	const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`);
	return pattern.exec(rawJson)?.[1];
}

function getErrorCode(error: unknown): string | undefined {
	if (error == null || typeof error !== 'object' || !('code' in error)) return undefined;
	return typeof error.code === 'string' ? error.code : undefined;
}

async function readMorphSdkPatchInfo(): Promise<MorphSdkPatchInfo> {
	try {
		let directory = dirname(moduleRequire.resolve(MORPH_SDK_PACKAGE));
		for (let depth = 0; depth < 8; depth++) {
			const packageJsonPath = resolve(directory, 'package.json');
			try {
				const packageJson = await readFile(packageJsonPath, 'utf8');
				if (readJsonStringField(packageJson, 'name') === MORPH_SDK_PACKAGE) {
					const packageRoot = directory;
					const version = readJsonStringField(packageJson, 'version') ?? 'unknown';
					const typeText = await readFile(resolve(packageRoot, 'dist/tools/fastapply/types.d.ts'), 'utf8');
					const runtimeText = await readFile(resolve(packageRoot, 'dist/tools/fastapply/apply.cjs'), 'utf8');
					const hasAutoType = typeText.includes(MORPH_APPLY_MODEL_TYPE_MARKER);
					const hasAutoRuntime = runtimeText.includes('MORPH_APPLY_MODEL') && runtimeText.includes('"auto"');
					return {
						packageName: MORPH_SDK_PACKAGE,
						version,
						status: hasAutoType && hasAutoRuntime ? 'auto-default-available' : 'auto-default-not-detected',
						detail:
							hasAutoType && hasAutoRuntime
								? 'installed SDK exposes model auto and defaults omitted Apply model to auto'
								: 'installed SDK does not expose the expected auto-default patch markers',
					};
				}
			} catch (error) {
				if (getErrorCode(error) !== 'ENOENT') throw error;
			}

			const parent = dirname(directory);
			if (parent === directory) break;
			directory = parent;
		}
	} catch (error) {
		return {
			packageName: MORPH_SDK_PACKAGE,
			version: 'unknown',
			status: 'unknown',
			detail: error instanceof Error ? error.message : String(error),
		};
	}

	return {
		packageName: MORPH_SDK_PACKAGE,
		version: 'unknown',
		status: 'unknown',
		detail: 'package root not found from runtime resolver',
	};
}

export async function getMorphRuntimeConfig(): Promise<MorphRuntimeConfig> {
	cachedRuntimeConfig ??= (async () => {
		const apiBaseUrl = resolveMorphApiBaseUrl();
		const timeout = resolveMorphTimeout();
		return {
			apiBaseUrl: apiBaseUrl.value,
			displayApiBaseUrl: apiBaseUrl.displayValue,
			apiBaseUrlSource: apiBaseUrl.source,
			apiBaseUrlHost: apiBaseUrl.host,
			apiBaseUrlCustomHost: apiBaseUrl.customHost,
			timeoutMs: timeout.value,
			timeoutSource: timeout.source,
			applyDefaultModel: MORPH_APPLY_DEFAULT_MODEL,
			sdkPatch: await readMorphSdkPatchInfo(),
		};
	})();
	return cachedRuntimeConfig;
}

export function buildApplyConfig(apiKey: string, runtimeConfig: MorphRuntimeConfig): ApplyEditConfig {
	return {
		morphApiKey: apiKey,
		morphApiUrl: runtimeConfig.apiBaseUrl,
		timeout: runtimeConfig.timeoutMs,
		generateUdiff: true,
	};
}
