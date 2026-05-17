import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveWorkspaceFilePath } from '../extensions/morph-apply';

let root: string;
let outside: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'pi-fast-apply-root-'));
	outside = await mkdtemp(join(tmpdir(), 'pi-fast-apply-outside-'));
});

afterEach(async () => {
	await rm(root, { force: true, recursive: true });
	await rm(outside, { force: true, recursive: true });
});

describe('resolveWorkspaceFilePath', () => {
	it('allows normal files inside the workspace', async () => {
		await writeFile(join(root, 'src.ts'), 'export const ok = true;\n');

		await expect(resolveWorkspaceFilePath(root, 'src.ts')).resolves.toMatchObject({
			absolutePath: await realpath(join(root, 'src.ts')),
		});
	});

	it('rejects parent traversal outside the workspace', async () => {
		await writeFile(join(outside, 'outside.ts'), 'secret\n');

		await expect(resolveWorkspaceFilePath(root, `../${outside.split('/').at(-1)}/outside.ts`)).rejects.toThrow(
			'fast_apply only supports files inside the current workspace',
		);
	});

	it('rejects absolute paths outside the workspace', async () => {
		const target = join(outside, 'outside.ts');
		await writeFile(target, 'secret\n');

		await expect(resolveWorkspaceFilePath(root, target)).rejects.toThrow(
			'fast_apply only supports files inside the current workspace',
		);
	});

	it('rejects symlinks that escape the workspace', async () => {
		const target = join(outside, 'outside.ts');
		await writeFile(target, 'secret\n');
		await symlink(target, join(root, 'link.ts'));

		await expect(resolveWorkspaceFilePath(root, 'link.ts')).rejects.toThrow(
			'fast_apply only supports files inside the current workspace',
		);
	});

	it.each([
		'.env',
		'.npmrc',
		'auth.json',
		'credentials.json',
		'id_rsa',
		'id_dsa',
		'id_ecdsa',
		'id_ed25519',
		'key.pem',
		'key.p12',
		'key.pfx',
		'key.ppk',
		'secret.gpg',
		'backup.agekey',
		'debug.log',
	])('rejects obvious secret file %s', async (name) => {
		await writeFile(join(root, name), 'token=value\n');

		await expect(resolveWorkspaceFilePath(root, name)).rejects.toThrow('fast_apply refuses obvious secret files');
	});
});
