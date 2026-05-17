import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WarpGrepClient } from '@morphllm/morphsdk';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSearchDetails, createSafeWarpGrepProvider, formatSearchContent } from '../extensions/codebase-search-tool';
import { buildWarpGrepConfig, type MorphRuntimeConfig } from '../extensions/runtime-config';

const apiKey = process.env.MORPH_API_KEY;
const publicRepoRoot = process.env.CODEBASE_SEARCH_PUBLIC_REPO_ROOT;

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

const liveRoots: string[] = [];
const liveFixtureDirs: string[] = [];

async function createLiveRedactionRepo(): Promise<{ repoRoot: string; token: string; genericSecret: string }> {
	const repoRoot = await mkdtemp(join(tmpdir(), 'pi-fast-apply-live-redaction-'));
	liveRoots.push(repoRoot);
	const token = 'glpat-abcdefghijklmnopqrst';
	const genericSecret = 'correct-horse-battery-staple';
	await writeFile(
		join(repoRoot, 'README.md'),
		[
			'# Fixture app',
			'',
			'Credential config lives in credentials.json. Runtime code loads config from src/config.ts.',
			'Use credentials.json for API credential examples during search.',
			'',
		].join('\n'),
	);
	await writeFile(
		join(repoRoot, 'credentials.json'),
		JSON.stringify({ apiToken: token, databasePassword: genericSecret }, null, 2),
	);
	await writeFile(
		join(repoRoot, 'src-config.ts'),
		[
			"import credentials from './credentials.json';",
			'',
			'export function loadCredentialConfig() {',
			'  return credentials;',
			'}',
			'',
		].join('\n'),
	);
	return { repoRoot, token, genericSecret };
}

afterEach(async () => {
	await Promise.all(liveFixtureDirs.splice(0).map((fixtureDir) => rm(fixtureDir, { force: true, recursive: true })));
	await Promise.all(liveRoots.splice(0).map((repoRoot) => rm(repoRoot, { force: true, recursive: true })));
});

async function writePublicRepoRedactionFixture(repoRoot: string): Promise<{ token: string; genericSecret: string; fixtureDir: string }> {
	const fixtureDir = join(repoRoot, 'test', 'fixtures', 'pi-fast-apply-redaction');
	const token = 'glpat-abcdefghijklmnopqrst';
	const genericSecret = 'correct-horse-battery-staple';
	await mkdir(fixtureDir, { recursive: true });
	liveFixtureDirs.push(fixtureDir);
	await writeFile(
		join(fixtureDir, 'redaction-helper.js'),
		[
			'export function loadRedactionFixture() {',
			"  return 'redaction fixture helper';",
			'}',
			'',
		].join('\n'),
	);
	await writeFile(
		join(fixtureDir, 'README.md'),
		[
			'# Pi Fast Apply redaction fixture',
			'',
			'Credential examples live in credentials.json for the redaction integration test.',
			'Related code lives in redaction-helper.js.',
			'',
		].join('\n'),
	);
	await writeFile(join(fixtureDir, 'credentials.json'), JSON.stringify({ token, genericSecret }, null, 2));
	return { token, genericSecret, fixtureDir };
}

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

	it.skipIf(!apiKey)('finds codebase search redaction plumbing in this real repo', async () => {
		const searchTerm = 'Find where codebase_search redacts provider read and grep output before Morph sees it';
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
		expect(output).toMatch(/extensions\/(codebase-search-tool|secret-redaction)\.ts/);
		expect(output).not.toContain(repoRoot);
	}, 180_000);

	it.skipIf(!apiKey)('keeps synthetic secrets out of live Morph search results', async () => {
		const { repoRoot, token, genericSecret } = await createLiveRedactionRepo();
		const searchTerm = 'Find credential configuration in credentials.json and related config loader code';
		const client = new WarpGrepClient(buildWarpGrepConfig(apiKey ?? '', runtimeConfig));
		const result = await client.execute({
			searchTerm,
			repoRoot,
			provider: createSafeWarpGrepProvider(repoRoot),
		});

		expect(result.success).toBe(true);
		const details = buildSearchDetails(searchTerm, repoRoot, result);
		const output = formatSearchContent(details);

		expect(output).toContain('Codebase Search:');
		expect(output).not.toContain(token);
		expect(output).not.toContain(genericSecret);
		expect(output).toContain('src-config.ts');
	}, 180_000);

	it.skipIf(!apiKey || !publicRepoRoot)('finds module loader context in a large public repo clone', async () => {
		const searchTerm = 'Find Node.js CommonJS module loading and resolution implementation';
		const repoRoot = publicRepoRoot ?? '';
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
		expect(output).toMatch(/(lib\/internal\/modules\/cjs\/loader|lib\/internal\/modules\/esm\/resolve)\.js/);
		expect(output).not.toContain(repoRoot);
	}, 240_000);

	it.skipIf(!apiKey || !publicRepoRoot)('keeps synthetic secrets out of live search on a large public repo clone', async () => {
		const repoRoot = publicRepoRoot ?? '';
		const { token, genericSecret } = await writePublicRepoRedactionFixture(repoRoot);
		const searchTerm = 'Find the Pi Fast Apply redaction fixture credentials and helper code';
		const client = new WarpGrepClient(buildWarpGrepConfig(apiKey ?? '', runtimeConfig));
		const result = await client.execute({
			searchTerm,
			repoRoot,
			provider: createSafeWarpGrepProvider(repoRoot),
		});

		expect(result.success).toBe(true);
		const details = buildSearchDetails(searchTerm, repoRoot, result);
		const output = formatSearchContent(details);

		expect(output).toContain('Codebase Search:');
		expect(output).toContain('redaction-helper.js');
		expect(output).not.toContain(token);
		expect(output).not.toContain(genericSecret);
	}, 240_000);
});
