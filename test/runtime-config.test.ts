import { describe, expect, it } from 'vitest';
import { buildApplyConfig, type MorphRuntimeConfig } from '../extensions/runtime-config';

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
		detail: 'test fixture',
	},
};

describe('buildApplyConfig', () => {
	it('passes runtime-owned config without model selectors', () => {
		const config = buildApplyConfig('test-key', runtimeConfig);

		expect(config).toEqual({
			morphApiKey: 'test-key',
			morphApiUrl: 'https://api.morphllm.com',
			timeout: 60_000,
			generateUdiff: true,
		});
		expect('model' in config).toBe(false);
		expect('large' in config).toBe(false);
	});
});
