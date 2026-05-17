import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
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

async function writePublicRepoRedactionFixture(repoRoot: string): Promise<{
	fixtureDir: string;
	plainToken: string;
	genericSecret: string;
	npmToken: string;
	stripeToken: string;
	dockerAuth: string;
	paths: {
		appLog: string;
		credentials: string;
		dockerConfig: string;
		env: string;
		helper: string;
		npmrc: string;
		plainTokenSource: string;
		secretsYaml: string;
		serviceAccount: string;
	};
}> {
	await mkdir(join(repoRoot, 'test', 'fixtures'), { recursive: true });
	const fixtureDir = await mkdtemp(join(repoRoot, 'test', 'fixtures', 'pi-fast-apply-redaction-'));
	const plainToken = 'glpat-abcdefghijklmnopqrst';
	const genericSecret = 'correct-horse-battery-staple';
	const npmToken = `npm_${'A'.repeat(36)}`;
	const stripeToken = `sk_test_${'B'.repeat(32)}`;
	const dockerAuth = 'generic-base64-ish-value';
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
			'Credential examples live in credentials.json, .env, .npmrc, .docker/config.json, service-account.json, secrets.yaml, and app.log for the redaction integration test.',
			'Related code lives in redaction-helper.js.',
			'',
		].join('\n'),
	);
	await writeFile(join(fixtureDir, 'credentials.json'), JSON.stringify({ token: plainToken, genericSecret }, null, 2));
	await writeFile(join(fixtureDir, '.env'), `DATABASE_PASSWORD=${genericSecret}\nSTRIPE_SECRET=${stripeToken}\n`);
	await writeFile(join(fixtureDir, '.npmrc'), `//registry.npmjs.org/:_authToken=${npmToken}\n`);
	await mkdir(join(fixtureDir, '.docker'), { recursive: true });
	await writeFile(join(fixtureDir, '.docker', 'config.json'), JSON.stringify({ auths: { example: { auth: dockerAuth } } }, null, 2));
	await writeFile(join(fixtureDir, 'service-account.json'), JSON.stringify({ client_secret: genericSecret }, null, 2));
	await writeFile(join(fixtureDir, 'secrets.yaml'), `api_key: ${genericSecret}\n`);
	await writeFile(join(fixtureDir, 'app.log'), `token=${plainToken}\npassword=${genericSecret}\n`);
	await writeFile(join(fixtureDir, 'plain-token-source.js'), `export const token = '${plainToken}';\nexport const password = 'DATABASE_PASSWORD=${genericSecret}';\n`);
	await mkdir(join(repoRoot, 'packages'), { recursive: true });
	const packageFixtureRoot = await mkdtemp(join(repoRoot, 'packages', 'pi-fast-apply-redaction-'));
	const packageFixtureDir = join(packageFixtureRoot, 'src', 'fixtures');
	await mkdir(packageFixtureDir, { recursive: true });
	liveFixtureDirs.push(packageFixtureRoot);
	await writeFile(
		join(packageFixtureDir, 'plain-token-source.ts'),
		`export const piFastApplyPlainToken = '${plainToken}';\nexport const piFastApplyDatabasePassword = 'DATABASE_PASSWORD=${genericSecret}';\n`,
	);
	await writeFile(
		join(packageFixtureDir, 'credential-inventory.ts'),
		[
			"export const piFastApplyCredentialInventory = {",
			`  npmToken: '${npmToken}',`,
			`  stripeToken: '${stripeToken}',`,
			`  dockerAuth: '${dockerAuth}',`,
			'};',
			'',
		].join('\n'),
	);
	const guessedFixtureDir = await mkdtemp(join(repoRoot, 'test', 'fixtures', 'pi-fast-apply-redaction-guessed-'));
	await mkdir(join(guessedFixtureDir, 'redaction-fixture'), { recursive: true });
	liveFixtureDirs.push(guessedFixtureDir);
	await writeFile(
		join(guessedFixtureDir, 'redaction-fixture', 'plain-token-source.js'),
		`export const piFastApplyPlainToken = '${plainToken}';\nexport const piFastApplyDatabasePassword = 'DATABASE_PASSWORD=${genericSecret}';\n`,
	);
	await writeFile(
		join(guessedFixtureDir, 'credential-inventory.json'),
		JSON.stringify({ npmToken, stripeToken, dockerAuth, genericSecret }, null, 2),
	);
	return {
		plainToken,
		genericSecret,
		npmToken,
		stripeToken,
		dockerAuth,
		fixtureDir,
		paths: {
			appLog: relative(repoRoot, join(fixtureDir, 'app.log')),
			credentials: relative(repoRoot, join(fixtureDir, 'credentials.json')),
			dockerConfig: relative(repoRoot, join(fixtureDir, '.docker', 'config.json')),
			env: relative(repoRoot, join(fixtureDir, '.env')),
			helper: relative(repoRoot, join(fixtureDir, 'redaction-helper.js')),
			npmrc: relative(repoRoot, join(fixtureDir, '.npmrc')),
			plainTokenSource: relative(repoRoot, join(fixtureDir, 'plain-token-source.js')),
			secretsYaml: relative(repoRoot, join(fixtureDir, 'secrets.yaml')),
			serviceAccount: relative(repoRoot, join(fixtureDir, 'service-account.json')),
		},
	};
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

	it.skipIf(!apiKey || !publicRepoRoot)('keeps polluted synthetic secrets out of live search on a large public repo clone', async () => {
		const repoRoot = publicRepoRoot ?? '';
		const { plainToken, genericSecret, npmToken, stripeToken, dockerAuth, paths } =
			await writePublicRepoRedactionFixture(repoRoot);
		const searchTerm = `Read ${paths.plainTokenSource}, ${paths.credentials}, ${paths.env}, ${paths.npmrc}, ${paths.dockerConfig}, ${paths.serviceAccount}, ${paths.secretsYaml}, ${paths.appLog}, and ${paths.helper}`;
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
		expect(output).toMatch(/redaction-helper\.js|plain-token-source\.ts|credential-inventory\.ts/);
		expect(output).not.toContain(plainToken);
		expect(output).not.toContain(genericSecret);
		expect(output).not.toContain(npmToken);
		expect(output).not.toContain(stripeToken);
		expect(output).not.toContain(dockerAuth);
	}, 240_000);

	it.skipIf(!apiKey || !publicRepoRoot)('can disable redaction for polluted synthetic fixtures on a large public repo clone', async () => {
		const repoRoot = publicRepoRoot ?? '';
		const { plainToken, genericSecret, paths } = await writePublicRepoRedactionFixture(repoRoot);
		const searchTerm = `Read ${paths.plainTokenSource} and ${paths.credentials}`;
		const client = new WarpGrepClient(buildWarpGrepConfig(apiKey ?? '', runtimeConfig));
		const result = await client.execute({
			searchTerm,
			repoRoot,
			provider: createSafeWarpGrepProvider(repoRoot, { enabled: false }),
		});

		expect(result.success).toBe(true);
		const details = buildSearchDetails(searchTerm, repoRoot, result);
		const output = formatSearchContent(details);

		expect(output).toContain('Codebase Search:');
		expect(output).toMatch(/plain-token-source\.(ts|js)/);
		expect(output).toContain(plainToken);
		expect(output).toContain(genericSecret);
	}, 240_000);
});
