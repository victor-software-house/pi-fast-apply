import { WarpGrepClient } from '@morphllm/morphsdk';
import { describe, expect, it } from 'vitest';
import { buildSearchDetails, createSafeWarpGrepProvider, formatSearchContent } from '../extensions/codebase-search-tool';
import { buildWarpGrepConfig, type MorphRuntimeConfig } from '../extensions/runtime-config';

const apiKey = process.env.MORPH_API_KEY;

const runtimeConfig: MorphRuntimeConfig = {
	apiBaseUrl: 'https://api.morphllm.com',
	displayApiBaseUrl: 'https://api.morphllm.com',
	apiBaseUrlSource: 'default',
	apiBaseUrlHost: 'api.morphllm.com',
	apiBaseUrlCustomHost: false,
	timeoutMs: 60_000,
	timeoutSource: 'default',
	applyDefaultModel: 'auto',
	sdkPatch: {
		packageName: '@morphllm/morphsdk',
		version: '0.2.171',
		status: 'auto-default-available',
		detail: 'live test fixture',
	},
};

describe('Codebase Search live', () => {
	it.skipIf(!apiKey)('finds Morph auth and runtime config helpers in this repo', async () => {
		const searchTerm = 'Find Morph auth resolution and runtime config helpers';
		const repoRoot = process.cwd();
		const client = new WarpGrepClient(buildWarpGrepConfig(apiKey ?? '', runtimeConfig));
		const result = await client.execute({
			searchTerm,
			repoRoot,
			provider: createSafeWarpGrepProvider(repoRoot),
		});

		expect(result.success).toBe(true);
		expect(result.contexts?.length ?? 0).toBeGreaterThan(0);

		const details = buildSearchDetails(searchTerm, repoRoot, result);
		const output = formatSearchContent(details);

		expect(output).toContain('Codebase Search:');
		expect(output).toMatch(/extensions\/(auth|runtime-config)\.ts/);
		expect(output).not.toContain(repoRoot);
	}, 180_000);
});
