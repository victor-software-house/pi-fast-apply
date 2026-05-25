import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveWorkspaceFilePath } from '../extensions/morph-apply';

let root: string;
let outside: string;

async function expectResolved(inputPath: string, targetPath: string): Promise<void> {
	await expect(resolveWorkspaceFilePath(root, inputPath)).resolves.toMatchObject({
		absolutePath: await realpath(targetPath),
	});
}

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'pi-fast-apply-root-'));
	outside = await mkdtemp(join(tmpdir(), 'pi-fast-apply-outside-'));
});

afterEach(async () => {
	await rm(root, { force: true, recursive: true });
	await rm(outside, { force: true, recursive: true });
});

describe('resolveWorkspaceFilePath', () => {
	it('resolves paths without imposing access policy', async () => {
		const insideFile = join(root, 'src.ts');
		const outsideFile = join(outside, 'outside.ts');
		await writeFile(insideFile, 'content\n');
		await writeFile(outsideFile, 'content\n');
		await symlink(outsideFile, join(root, 'link.ts'));

		await expectResolved('src.ts', insideFile);
		await expectResolved(`../${outside.split('/').at(-1)}/outside.ts`, outsideFile);
		await expectResolved(outsideFile, outsideFile);
		await expectResolved('link.ts', outsideFile);
	});

	it.each(['.env', '.npmrc', 'auth.json', 'id_rsa', 'key.pem', 'secret.gpg', 'debug.log'])(
		'allows sensitive-looking filename %s',
		async (name) => {
			const targetPath = join(root, name);
			await writeFile(targetPath, 'content\n');

			await expectResolved(name, targetPath);
		},
	);
});
