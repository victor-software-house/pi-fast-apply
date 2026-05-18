import { performance } from 'node:perf_hooks';
import { WarpGrepClient, type WarpGrepProvider } from '@morphllm/morphsdk';
import { buildSearchDetails, createSafeWarpGrepProvider, formatSearchContent } from '../extensions/codebase-search-tool';
import { buildWarpGrepConfig, type MorphRuntimeConfig } from '../extensions/runtime-config';

const apiKey = process.env.MORPH_API_KEY;
if (!apiKey) throw new Error('MORPH_API_KEY missing. Use fnox/mise/etc. Do not hardcode it.');

const repoRoot = process.env.CODEBASE_SEARCH_PUBLIC_REPO_ROOT ?? process.cwd();
const redactionEnabled = process.env.CODEBASE_SEARCH_REDACTION !== '0';
const args = process.argv.slice(2);
const searchTerm =
	(args[0] === '--' ? args.slice(1) : args).join(' ').trim() ||
	'Find Node.js CommonJS module loading and resolution implementation';
const includesEnv = process.env.CODEBASE_SEARCH_INCLUDES;
const excludesEnv = process.env.CODEBASE_SEARCH_EXCLUDES;
const searchTypeEnv = process.env.CODEBASE_SEARCH_TYPE;
const includes = includesEnv ? includesEnv.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
const excludes = excludesEnv ? excludesEnv.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
const searchType = searchTypeEnv === 'node_modules' ? 'node_modules' : searchTypeEnv === 'default' ? 'default' : undefined;

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
		detail: 'timing harness',
	},
};

type ProviderMethod = 'glob' | 'grep' | 'listDirectory' | 'read';

interface ProviderStat {
	calls: number;
	maxMs: number;
	totalItems: number;
	totalMs: number;
}

interface ProviderCall {
	args: unknown;
	count: number;
	method: ProviderMethod;
	ms: number;
}

const providerStats: Record<ProviderMethod, ProviderStat> = {
	glob: { calls: 0, maxMs: 0, totalItems: 0, totalMs: 0 },
	grep: { calls: 0, maxMs: 0, totalItems: 0, totalMs: 0 },
	listDirectory: { calls: 0, maxMs: 0, totalItems: 0, totalMs: 0 },
	read: { calls: 0, maxMs: 0, totalItems: 0, totalMs: 0 },
};

const providerCalls: ProviderCall[] = [];

function roundMs(value: number): number {
	return Math.round(value * 10) / 10;
}

function recordProviderCall(method: ProviderMethod, startedAt: number, args: unknown, count: number): void {
	const ms = roundMs(performance.now() - startedAt);
	const stat = providerStats[method];
	stat.calls += 1;
	stat.totalItems += count;
	stat.totalMs = roundMs(stat.totalMs + ms);
	stat.maxMs = Math.max(stat.maxMs, ms);
	providerCalls.push({ method, ms, args, count });
}

function instrumentProvider(provider: WarpGrepProvider): WarpGrepProvider {
	return {
		async glob(params) {
			const startedAt = performance.now();
			const result = await provider.glob(params);
			recordProviderCall('glob', startedAt, params, result.files.length);
			return result;
		},
		async grep(params) {
			const startedAt = performance.now();
			const result = await provider.grep(params);
			recordProviderCall('grep', startedAt, params, result.lines.length);
			return result;
		},
		async listDirectory(params) {
			const startedAt = performance.now();
			const result = await provider.listDirectory(params);
			recordProviderCall('listDirectory', startedAt, params, result.length);
			return result;
		},
		async read(params) {
			const startedAt = performance.now();
			const result = await provider.read(params);
			recordProviderCall('read', startedAt, params, result.lines.length);
			return result;
		},
	};
}

const client = new WarpGrepClient(buildWarpGrepConfig(apiKey, runtimeConfig));
const providerOptions: Parameters<typeof createSafeWarpGrepProvider>[1] = { enabled: redactionEnabled };
if (includes) providerOptions.includes = includes;
if (excludes) providerOptions.excludes = excludes;
if (searchType) providerOptions.searchType = searchType;
const provider = instrumentProvider(createSafeWarpGrepProvider(repoRoot, providerOptions));
const startedAt = performance.now();
const stream = client.execute({
	searchTerm,
	repoRoot,
	provider,
	streamSteps: true,
	...(includes ? { includes } : {}),
	...(excludes ? { excludes } : {}),
	...(searchType ? { search_type: searchType } : {}),
});
const steps: unknown[] = [];
let result;

for (;;) {
	const next = await stream.next();
	if (next.done === true) {
		result = next.value;
		break;
	}
	steps.push(next.value);
}

const totalMs = roundMs(performance.now() - startedAt);
const details = buildSearchDetails(searchTerm, repoRoot, result);
const formatted = formatSearchContent(details);

console.log(
	JSON.stringify(
		{
			searchTerm,
			repoRoot,
			redactionEnabled,
			includes,
			excludes,
			searchType,
			totalMs,
			sdkTimings: (result as { timings?: unknown }).timings ?? null,
			steps,
			providerStats,
			providerCalls,
			success: result.success,
			contextCount: result.contexts?.length ?? 0,
			files: details.contexts.map((context) => context.file),
		},
		null,
		2,
	),
);

console.error('\n--- formatted output preview ---\n' + formatted.slice(0, 2500));
