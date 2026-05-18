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
	/** Morph API call latency in milliseconds. */
	latencyMs?: number;
	/** True when the target file did not exist and was created by this call. */
	isNewFile?: boolean;
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

function assertNotSensitivePath(_workspaceRoot: string, targetPath: string): void {
	const name = basename(targetPath).toLowerCase();
	const blockedNames = new Set([
		'.env',
		'.npmrc',
		'auth.json',
		'credentials.json',
		'id_rsa',
		'id_dsa',
		'id_ecdsa',
		'id_ed25519',
	]);
	const blockedExtensions = ['.pem', '.key', '.p12', '.pfx', '.ppk', '.asc', '.gpg', '.agekey', '.log'];

	if (
		name.startsWith('.env.') ||
		blockedNames.has(name) ||
		name.startsWith('id_rsa') ||
		name.startsWith('id_dsa') ||
		name.startsWith('id_ecdsa') ||
		name.startsWith('id_ed25519') ||
		blockedExtensions.some((extension) => name.endsWith(extension))
	) {
		throw new Error('fast_apply refuses obvious secret files. Use edit for sensitive files.');
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
