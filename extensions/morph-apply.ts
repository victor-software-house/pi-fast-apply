import { constants } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import type { ApplyEditInput, ApplyEditResult, EditChanges } from '@morphllm/morphsdk';
import { applyEdit } from '@morphllm/morphsdk';
import { EXISTING_CODE_MARKER, NON_TRIVIAL_FILE_LINE_COUNT } from './constants';
import {
	buildApplyConfig,
	type MorphApplyDefaultModel,
	type MorphRuntimeConfig,
	type MorphSdkPatchStatus,
} from './runtime-config';

export interface FastApplyDetails {
	provider: string;
	path: string;
	absolutePath: string;
	dryRun: boolean;
	instruction: string;
	changes: EditChanges;
	udiff: string | undefined;
	mergedCode: string;
	originalCode: string;
	completionId: string | undefined;
	originalLineCount: number;
	mergedLineCount: number;
	apiBaseUrl: string;
	apiBaseUrlHost: string;
	apiBaseUrlCustomHost: boolean;
	timeoutMs: number;
	applyDefaultModel: MorphApplyDefaultModel;
	sdkApplyPatchStatus: MorphSdkPatchStatus;
	sdkVersion: string;
}

export interface ResolvedWorkspaceFile {
	requestedPath: string;
	absolutePath: string;
}

function assertInsideWorkspace(workspaceRoot: string, targetPath: string): void {
	const relativePath = relative(workspaceRoot, targetPath);
	if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) return;

	throw new Error(
		'fast_apply only supports files inside the current workspace. Refusing to read or send files outside ctx.cwd.',
	);
}

function assertNotSensitivePath(workspaceRoot: string, targetPath: string): void {
	const relativePath = relative(workspaceRoot, targetPath);
	const parts = relativePath.split(/[\\/]+/).map((part) => part.toLowerCase());
	const name = basename(targetPath).toLowerCase();
	const lowerRelative = relativePath.toLowerCase();
	const normalizedRelative = parts.join('/');
	const blockedNames = new Set([
		'.env',
		'.npmrc',
		'.netrc',
		'.pypirc',
		'.dockercfg',
		'.git-credentials',
		'auth.json',
		'credentials.json',
		'kubeconfig',
		'id_rsa',
		'id_dsa',
		'id_ecdsa',
		'id_ed25519',
		'keys.txt',
		'gradle.properties',
	]);
	const allowedDotfiles = new Set(['.editorconfig', '.gitattributes', '.gitignore', '.npmignore', '.prettierignore']);
	const blockedExtensions = ['.env', '.pem', '.key', '.p12', '.pfx', '.ppk', '.asc', '.gpg', '.agekey'];
	const sensitiveDirectories = [
		'.git',
		'.ssh',
		'.gnupg',
		'.aws',
		'.azure',
		'.docker',
		'.kube',
		'.m2',
		'.gradle',
		'.config/gcloud',
		'.config/gh',
		'.config/hub',
	];
	const sensitiveNamePrefixes = ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'];
	const sensitiveNameFragments = ['secret', 'credential', 'credentials', 'token', 'private'];
	const isSensitiveDirectory = sensitiveDirectories.some(
		(directory) => normalizedRelative === directory || normalizedRelative.startsWith(`${directory}/`),
	);

	if (
		name.startsWith('.env.') ||
		name.endsWith('.env') ||
		(name.startsWith('.') && !allowedDotfiles.has(name)) ||
		blockedNames.has(name) ||
		sensitiveNamePrefixes.some((prefix) => name.startsWith(prefix)) ||
		blockedExtensions.some((extension) => name.endsWith(extension)) ||
		isSensitiveDirectory ||
		sensitiveNameFragments.some((fragment) => lowerRelative.includes(fragment))
	) {
		throw new Error(
			'fast_apply refuses likely secret files because Morph receives the full original file. Use edit for sensitive files.',
		);
	}
}

export async function resolveWorkspaceFilePath(
	workspaceCwd: string,
	inputPath: string,
): Promise<ResolvedWorkspaceFile> {
	const targetPath = expandPath(inputPath);
	const workspaceRoot = await realpath(workspaceCwd);
	const requestedPath = resolve(workspaceRoot, targetPath);
	const absolutePath = await realpath(requestedPath);
	assertInsideWorkspace(workspaceRoot, absolutePath);
	assertNotSensitivePath(workspaceRoot, absolutePath);
	return { requestedPath, absolutePath };
}

export function expandPath(filePath: string): string {
	const normalized = filePath.startsWith('@') ? filePath.slice(1) : filePath;
	if (normalized === '~') return homedir();
	if (normalized.startsWith('~/')) return homedir() + normalized.slice(1);
	return normalized;
}

export function countLines(text: string): number {
	return text.length === 0 ? 0 : text.split('\n').length;
}

export async function ensureReadableFile(absolutePath: string): Promise<void> {
	await access(absolutePath, constants.R_OK);
}

export function validateInputForExistingFile(codeEdit: string, originalCode: string): void {
	const originalLines = countLines(originalCode);
	if (originalLines > NON_TRIVIAL_FILE_LINE_COUNT && !codeEdit.includes(EXISTING_CODE_MARKER)) {
		throw new Error(
			`Missing '${EXISTING_CODE_MARKER}' markers for an existing ${originalLines}-line file. Use fast_apply for partial edits with markers, or use write for full replacement.`,
		);
	}
}

export function validateMergedOutput(originalCode: string, codeEdit: string, mergedCode: string): void {
	if (!mergedCode.trim()) {
		throw new Error('Morph returned an empty merged file, so the edit was not written.');
	}

	const originalHadMarker = originalCode.includes(EXISTING_CODE_MARKER);
	const editHadMarker = codeEdit.includes(EXISTING_CODE_MARKER);
	if (editHadMarker && !originalHadMarker && mergedCode.includes(EXISTING_CODE_MARKER)) {
		throw new Error(
			`Morph returned output containing '${EXISTING_CODE_MARKER}' for a file that did not previously contain it. Refusing to write potentially unsafe output.`,
		);
	}
}

export function summarizeResult(
	relativePath: string,
	dryRun: boolean,
	changes: EditChanges,
	udiff: string | undefined,
): string {
	const mode = dryRun ? 'Morph dry run' : 'Morph edit applied';
	const lines = [
		`${mode}: ${relativePath}`,
		`Changes: +${changes.linesAdded} -${changes.linesRemoved} ~${changes.linesModified}`,
	];
	if (udiff != null && udiff !== '') {
		lines.push('', udiff);
	}
	return lines.join('\n');
}

export async function runMorphApply(
	input: ApplyEditInput,
	apiKey: string,
	runtimeConfig: MorphRuntimeConfig,
): Promise<ApplyEditResult> {
	return applyEdit(input, buildApplyConfig(apiKey, runtimeConfig));
}
