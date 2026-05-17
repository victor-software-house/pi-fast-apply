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

	it.each(['.env', '.npmrc', 'secrets.pem', '.ssh/id_ed25519'])('redacts secret-like reads for %s', async (name) => {
		await mkdir(join(root, name.split('/').slice(0, -1).join('/')), { recursive: true });
		await writeFile(join(root, name), 'token=value\n');
		const provider = createSafeWarpGrepProvider(root);

		const result = await provider.read({ path: name });

		expect(result.lines).toHaveLength(1);
		expect(result.lines[0]).toContain('[REDACTED]');
		expect(result.lines[0]).not.toContain('token=value');
	});

	it('redacts secret-like file content from broad grep output', async () => {
		await writeFile(join(root, 'credentials.json'), 'leaked-token-value\n');
		await writeFile(join(root, 'src.ts'), 'leaked-token-value is mentioned in a safe fixture\n');
		const provider = createSafeWarpGrepProvider(root);

		const result = await provider.grep({ pattern: 'leaked-token-value', path: '.' });

		expect(result.lines.some((line) => line.includes('credentials.json') && line.includes('[REDACTED]'))).toBe(true);
		expect(result.lines.some((line) => line.includes('credentials.json') && line.includes('leaked-token-value'))).toBe(false);
		expect(result.lines.some((line) => line.includes('src.ts') && line.includes('leaked-token-value'))).toBe(true);
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
