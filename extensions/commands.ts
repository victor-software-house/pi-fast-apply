import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { CompactClient } from '@morphllm/morphsdk';
import { morphAuthSourceLabel, resolveMorphApiKey } from './auth';
import { MORPH_PROVIDER_ID } from './constants';
import { runMorphApply } from './morph-apply';
import { getMorphRuntimeConfig, type MorphRuntimeConfig } from './runtime-config';

interface MorphProbeCheck {
	name: string;
	status: 'pass' | 'fail' | 'skip';
	detail: string;
}

function formatProbeChecks(checks: MorphProbeCheck[]): string {
	const icon = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' } as const;
	return checks.map((check) => `- ${icon[check.status]} ${check.name}: ${check.detail}`).join('\n');
}

async function runProbeCheck(name: string, run: () => Promise<string>): Promise<MorphProbeCheck> {
	try {
		return { name, status: 'pass', detail: await run() };
	} catch (error) {
		return { name, status: 'fail', detail: error instanceof Error ? error.message : String(error) };
	}
}

async function runCompactProbe(apiKey: string, runtimeConfig: MorphRuntimeConfig): Promise<string> {
	const client = new CompactClient({
		morphApiKey: apiKey,
		morphApiUrl: runtimeConfig.apiBaseUrl,
		timeout: runtimeConfig.timeoutMs,
	});
	const result = await client.compact({
		messages: [
			{
				role: 'user',
				content: 'Keep auth config and SDK patch status. Drop repetition.\nAuth config ok. SDK patch ok.',
			},
		],
		query: 'auth config and SDK patch status',
		compressionRatio: 0.5,
		preserveRecent: 0,
	});
	return `ok (${result.model}, ${result.usage.processing_time_ms}ms)`;
}

async function runFastApplyProbe(apiKey: string, runtimeConfig: MorphRuntimeConfig): Promise<string> {
	const result = await runMorphApply(
		{
			originalCode: "export const status = 'old';\n",
			codeEdit: "export const status = 'new';\n",
			instruction: 'I am updating the status constant.',
		},
		apiKey,
		runtimeConfig,
	);
	if (!result.success || result.mergedCode == null || !result.mergedCode.includes("status = 'new'")) {
		throw new Error(result.error ?? 'Fast Apply did not produce expected merged output.');
	}
	return `ok (+${result.changes.linesAdded} -${result.changes.linesRemoved} ~${result.changes.linesModified})`;
}

export function registerMorphCommands(pi: ExtensionAPI): void {
	pi.registerCommand('morph-login', {
		description: 'Store a Morph API key in Pi auth storage',
		handler: async (_args, ctx) => {
			const key = _args.trim();
			if (key === '') {
				ctx.ui.notify(
					'Usage: /morph-login <api-key>\n' +
						'Store a Morph API key in Pi auth storage (~/.pi/agent/auth.json).\n' +
						'The key takes priority over the MORPH_API_KEY environment variable.',
					'warning',
				);
				return;
			}

			ctx.modelRegistry.authStorage.set(MORPH_PROVIDER_ID, { type: 'api_key', key });
			ctx.ui.notify('Morph API key stored in Pi auth storage.', 'info');
		},
	});

	pi.registerCommand('morph-logout', {
		description: 'Remove stored Morph API key from Pi auth storage',
		handler: async (_args, ctx) => {
			const had = ctx.modelRegistry.authStorage.has(MORPH_PROVIDER_ID);
			if (!had) {
				ctx.ui.notify('No Morph credentials found in Pi auth storage.', 'info');
				return;
			}

			ctx.modelRegistry.authStorage.remove(MORPH_PROVIDER_ID);
			ctx.ui.notify('Morph API key removed from Pi auth storage.', 'info');
		},
	});

	pi.registerCommand('morph-status', {
		description: 'Show Morph extension status and configuration hints',
		handler: async (_args, ctx) => {
			const [{ source }, runtimeConfig] = await Promise.all([
				resolveMorphApiKey(ctx.modelRegistry.authStorage),
				getMorphRuntimeConfig(),
			]);
			const patchDetail =
				runtimeConfig.sdkPatch.status === 'unknown'
					? 'SDK patch status could not be determined'
					: runtimeConfig.sdkPatch.detail;
			const lines = [
				'Morph extension status',
				`- API key: ${morphAuthSourceLabel(source)}`,
				'- Fast Apply provider: official Morph SDK',
				`- API base URL: ${runtimeConfig.displayApiBaseUrl} (${runtimeConfig.apiBaseUrlSource})`,
				`- API base host: ${runtimeConfig.apiBaseUrlHost}${runtimeConfig.apiBaseUrlCustomHost ? ' (custom)' : ''}`,
				`- Timeout: ${runtimeConfig.timeoutMs}ms (${runtimeConfig.timeoutSource})`,
				`- SDK package: ${runtimeConfig.sdkPatch.packageName}@${runtimeConfig.sdkPatch.version}`,
				`- SDK Apply default: ${runtimeConfig.applyDefaultModel}`,
				`- SDK auto patch: ${runtimeConfig.sdkPatch.status}`,
				`- SDK patch detail: ${patchDetail}`,
				'',
				'Auth resolution priority:',
				'  1. Pi auth storage (~/.pi/agent/auth.json) — set via /morph-login',
				'  2. MORPH_API_KEY environment variable (e.g. fnox, .env, shell export)',
			];
			ctx.ui.notify(lines.join('\n'), source !== 'none' ? 'info' : 'warning');
		},
	});

	pi.registerCommand('morph-probe', {
		description: 'Verify Morph runtime dependencies, auth, SDK patch, Compact, and Fast Apply',
		handler: async (_args, ctx) => {
			const checks: MorphProbeCheck[] = [];
			let runtimeConfig: MorphRuntimeConfig;
			try {
				runtimeConfig = await getMorphRuntimeConfig();
				checks.push({ name: 'runtime config', status: 'pass', detail: 'loaded' });
			} catch (error) {
				checks.push({
					name: 'runtime config',
					status: 'fail',
					detail: error instanceof Error ? error.message : String(error),
				});
				ctx.ui.notify(['Morph probe', formatProbeChecks(checks)].join('\n'), 'error');
				return;
			}

			checks.push({
				name: 'SDK package',
				status: runtimeConfig.sdkPatch.status === 'unknown' ? 'fail' : 'pass',
				detail: `${runtimeConfig.sdkPatch.packageName}@${runtimeConfig.sdkPatch.version}`,
			});
			checks.push({
				name: 'SDK Apply default',
				status: runtimeConfig.sdkPatch.status === 'auto-default-available' ? 'pass' : 'fail',
				detail: `${runtimeConfig.applyDefaultModel}; ${runtimeConfig.sdkPatch.status}`,
			});
			checks.push({
				name: 'API base URL',
				status: 'pass',
				detail: `${runtimeConfig.displayApiBaseUrl} (${runtimeConfig.apiBaseUrlSource})`,
			});
			checks.push({
				name: 'timeout',
				status: 'pass',
				detail: `${runtimeConfig.timeoutMs}ms (${runtimeConfig.timeoutSource})`,
			});

			const { key, source } = await resolveMorphApiKey(ctx.modelRegistry.authStorage);
			checks.push({
				name: 'auth',
				status: source === 'none' ? 'fail' : 'pass',
				detail: source === 'none' ? 'missing; use /morph-login or MORPH_API_KEY' : morphAuthSourceLabel(source),
			});

			if (source === 'none') {
				checks.push({ name: 'Compact API', status: 'skip', detail: 'requires Morph API key' });
				checks.push({ name: 'Fast Apply API', status: 'skip', detail: 'requires Morph API key' });
				checks.push({ name: 'Codebase Search API', status: 'skip', detail: 'requires Morph API key' });
				ctx.ui.notify(['Morph probe', formatProbeChecks(checks)].join('\n'), 'warning');
				return;
			}

			checks.push(await runProbeCheck('Compact API', () => runCompactProbe(key, runtimeConfig)));
			checks.push(await runProbeCheck('Fast Apply API', () => runFastApplyProbe(key, runtimeConfig)));
			checks.push({
				name: 'Codebase Search API',
				status: 'skip',
				detail: 'run codebase_search for live local verification',
			});
			const failed = checks.some((check) => check.status === 'fail');
			ctx.ui.notify(['Morph probe', formatProbeChecks(checks)].join('\n'), failed ? 'error' : 'info');
		},
	});
}
