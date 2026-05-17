import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	buildSearchDetails,
	createSafeWarpGrepProvider,
	formatSearchContent,
	resolveWorkspaceDirectory,
} from '../extensions/codebase-search-tool';
import { containsDetectedSecret, isCodebaseSearchRedactionEnabled } from '../extensions/secret-redaction';

let root: string;
let outside: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'pi-fast-apply-search-root-'));
	outside = await mkdtemp(join(tmpdir(), 'pi-fast-apply-search-outside-'));
});

afterEach(async () => {
	await rm(root, { force: true, recursive: true });
	await rm(outside, { force: true, recursive: true });
});

describe('resolveWorkspaceDirectory', () => {
	it('defaults to the workspace root', async () => {
		await expect(resolveWorkspaceDirectory(root, undefined)).resolves.toEqual({
			absolutePath: await realpath(root),
			requestedPath: await realpath(root),
		});
	});

	it('allows directories inside the workspace', async () => {
		await mkdir(join(root, 'packages'));

		await expect(resolveWorkspaceDirectory(root, 'packages')).resolves.toMatchObject({
			absolutePath: await realpath(join(root, 'packages')),
		});
	});

	it('rejects files as repo roots', async () => {
		await writeFile(join(root, 'src.ts'), 'export const ok = true;\n');

		await expect(resolveWorkspaceDirectory(root, 'src.ts')).rejects.toThrow(
			'codebase_search repoRoot must be a directory',
		);
	});

	it('rejects directories outside the workspace', async () => {
		await expect(resolveWorkspaceDirectory(root, outside)).rejects.toThrow(
			'codebase_search only supports repo roots inside the current workspace',
		);
	});
});

describe('createSafeWarpGrepProvider', () => {
	it('allows normal source reads and root grep', async () => {
		await writeFile(join(root, 'src.ts'), 'export const ok = true;\n');
		const provider = createSafeWarpGrepProvider(root);

		const readResult = await provider.read({ path: 'src.ts' });
		const grepResult = await provider.grep({ pattern: 'ok', path: '.' });

		expect(readResult.lines).toContain('1|export const ok = true;');
		expect(grepResult.lines.some((line) => line.includes('src.ts'))).toBe(true);
	});

	it('supports opt-out redaction for debugging', async () => {
		const token = 'glpat-abcdefghijklmnopqrst';
		await writeFile(join(root, 'src.ts'), `export const token = '${token}';\n`);
		const provider = createSafeWarpGrepProvider(root, { enabled: false });

		const result = await provider.read({ path: 'src.ts' });

		expect(result.lines).toContain(`1|export const token = '${token}';`);
	});

	it('redacts detected secrets from direct reads in normal files', async () => {
		const token = 'glpat-abcdefghijklmnopqrst';
		await writeFile(join(root, 'src.ts'), `export const token = '${token}';\nexport const safe = true;\n`);
		const provider = createSafeWarpGrepProvider(root);

		const result = await provider.read({ path: 'src.ts' });

		expect(result.lines).toContain("1|export const token = '[REDACTED]';");
		expect(result.lines).toContain('2|export const safe = true;');
		expect(result.lines.join('\n')).not.toContain(token);
	});

	it('redacts sensitive file reads without blocking path discovery', async () => {
		const token = 'glpat-abcdefghijklmnopqrst';
		await writeFile(join(root, '.env'), `TOKEN=${token}\nSAFE=value\n`);
		const provider = createSafeWarpGrepProvider(root);

		const result = await provider.read({ path: '.env' });

		expect(result.lines).toContain('1|[REDACTED] codebase_search found sensitive file content; content omitted.');
		expect(result.lines).toContain('2|[REDACTED] codebase_search found sensitive file content; content omitted.');
		expect(result.lines.join('\n')).not.toContain(token);
		expect(result.lines.join('\n')).not.toContain('SAFE=value');
	});

	it('redacts detected secrets from grep output while keeping line markers', async () => {
		const token = 'glpat-abcdefghijklmnopqrst';
		await writeFile(join(root, 'src.ts'), `export const token = '${token}';\nexport const safe = true;\n`);
		const provider = createSafeWarpGrepProvider(root);

		const result = await provider.grep({ pattern: token, path: '.' });

		expect(result.lines.some((line) => line.includes('src.ts') && line.includes('[REDACTED]'))).toBe(true);
		expect(result.lines.join('\n')).not.toContain(token);
	});

	it('redacts grep output from sensitive file paths even when the matched value is generic', async () => {
		await writeFile(join(root, '.npmrc'), 'registry=https://registry.npmjs.org\n');
		const provider = createSafeWarpGrepProvider(root);

		const result = await provider.grep({ pattern: 'registry', path: '.npmrc' });

		expect(result.lines).toEqual([
			'.npmrc:1:[REDACTED] codebase_search found sensitive file content; content omitted.',
		]);
	});

	it('redacts secret-like assignments in non-container files', async () => {
		await writeFile(
			join(root, 'src.ts'),
			"const safe = 'public-value'; const password = 'correct-horse-battery-staple';\n",
		);
		const provider = createSafeWarpGrepProvider(root);

		const result = await provider.read({ path: 'src.ts' });

		expect(result.lines.join('\n')).toContain("const safe = 'public-value'; const password = '[REDACTED]';");
		expect(result.lines.join('\n')).not.toContain('correct-horse-battery-staple');
	});

	it('redacts secret-like assignments in grep-prefixed lines', async () => {
		await writeFile(join(root, 'src.ts'), "const password = 'correct-horse-battery-staple';\n");
		const provider = createSafeWarpGrepProvider(root);

		const result = await provider.grep({ pattern: 'correct-horse-battery-staple', path: '.' });

		expect(result.lines.join('\n')).toContain("src.ts:1:const password = '[REDACTED]';");
		expect(result.lines.join('\n')).not.toContain('correct-horse-battery-staple');
	});

	it('redacts common credential container paths missed by scanners', async () => {
		await mkdir(join(root, '.docker'), { recursive: true });
		await writeFile(join(root, '.docker/config.json'), '{"auth":"generic-base64-ish-value"}\n');
		const provider = createSafeWarpGrepProvider(root);

		const result = await provider.read({ path: '.docker/config.json' });

		expect(result.lines).toContain('1|[REDACTED] codebase_search found sensitive file content; content omitted.');
		expect(result.lines.join('\n')).not.toContain('generic-base64-ish-value');
	});

	it('does not block directories by name or redact path-only glob output', async () => {
		await mkdir(join(root, '.ssh'), { recursive: true });
		await writeFile(join(root, '.ssh/config'), 'Host example\n');
		await writeFile(join(root, '.ssh/id_ed25519'), 'secret\n');
		const provider = createSafeWarpGrepProvider(root);

		const listResult = await provider.listDirectory({ path: '.ssh' });
		const globResult = await provider.glob({ pattern: '*', path: '.ssh' });

		expect(listResult.some((entry) => entry.path.endsWith('config'))).toBe(true);
		expect(listResult.some((entry) => entry.path.endsWith('id_ed25519'))).toBe(true);
		expect(globResult.files.some((file) => file.endsWith('config'))).toBe(true);
		expect(globResult.files.some((file) => file.endsWith('id_ed25519'))).toBe(true);
	});

	it('keeps WarpGrep default glob behavior', async () => {
		await writeFile(join(root, 'src.ts'), 'export const ok = true;\n');
		await writeFile(join(root, 'credentials.json'), 'token=value\n');
		const provider = createSafeWarpGrepProvider(root);
		const result = await provider.glob({ pattern: '*' });

		expect(result.files.some((file) => file.endsWith('src.ts'))).toBe(true);
		expect(result.files.some((file) => file.endsWith('credentials.json'))).toBe(true);
	});
});

describe('isCodebaseSearchRedactionEnabled', () => {
	const original = process.env.CODEBASE_SEARCH_REDACTION;

	afterEach(() => {
		if (original == null) {
			delete process.env.CODEBASE_SEARCH_REDACTION;
			return;
		}
		process.env.CODEBASE_SEARCH_REDACTION = original;
	});

	it('defaults on and accepts explicit opt-out values', () => {
		delete process.env.CODEBASE_SEARCH_REDACTION;
		expect(isCodebaseSearchRedactionEnabled()).toBe(true);
		process.env.CODEBASE_SEARCH_REDACTION = '0';
		expect(isCodebaseSearchRedactionEnabled()).toBe(false);
		process.env.CODEBASE_SEARCH_REDACTION = 'false';
		expect(isCodebaseSearchRedactionEnabled()).toBe(false);
	});
});

describe('containsDetectedSecret', () => {
	it('detects secret-like search terms before Morph receives them even when redaction is disabled', async () => {
		process.env.CODEBASE_SEARCH_REDACTION = '0';
		const githubToken = `github_pat_${'A'.repeat(82)}`;
		const npmToken = `npm_${'A'.repeat(36)}`;
		await expect(containsDetectedSecret('find glpat-abcdefghijklmnopqrst usage')).resolves.toBe(true);
		await expect(containsDetectedSecret(`find ${githubToken} usage`)).resolves.toBe(true);
		await expect(containsDetectedSecret(`find NPM_TOKEN=${npmToken} usage`)).resolves.toBe(true);
		await expect(containsDetectedSecret('find DATABASE_PASSWORD=correct-horse-battery-staple usage')).resolves.toBe(true);
		await expect(containsDetectedSecret('find auth config resolution')).resolves.toBe(false);
	});
});

describe('formatSearchContent', () => {
	it('returns bounded file contexts with line ranges', () => {
		const details = buildSearchDetails('/morph-status command', root, {
			success: true,
			summary: `Relevant context found:\n- ${join(root, 'extensions/commands.ts')}: 80-120`,
			contexts: [
				{
					file: join(root, 'extensions/commands.ts'),
					lines: [[80, 120]],
					content: 'registerCommand(\'morph-status\', {\n  description: \'Show status\',\n});',
				},
			],
		});

		expect(formatSearchContent(details)).toContain('<file path="extensions/commands.ts" lines="80-120">');
		expect(formatSearchContent(details)).not.toContain(root);
		expect(formatSearchContent(details)).toContain('extensions/commands.ts');
	});

	it('bounds context count and context lines', () => {
		const contexts = Array.from({ length: 10 }, (_, index) => ({
			file: `file-${index}.ts`,
			lines: '*' as const,
			content: Array.from({ length: 140 }, (__, lineIndex) => `line ${lineIndex}`).join('\n'),
		}));

		const details = buildSearchDetails('find runtime config', root, { success: true, contexts });
		const output = formatSearchContent(details);

		expect(details.contextCount).toBe(10);
		expect(details.shownContextCount).toBe(8);
		expect(details.truncated).toBe(true);
		expect(details.contexts.every((context) => context.content.split('\n').length <= 120)).toBe(true);
		expect(output).toContain('Output truncated. Refine searchTerm if more context is needed.');
		expect(output).not.toContain('file-8.ts');
	});

	it('keeps no-result output compact', () => {
		const details = buildSearchDetails('missing flow', root, { success: true, contexts: [] });

		expect(formatSearchContent(details)).toBe('Codebase Search: missing flow\nNo relevant code found.');
	});
});
