import { constants } from 'node:fs';
import { access, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import type { ApplyEditInput, ApplyEditResult, EditChanges } from '@morphllm/morphsdk';
import { applyEdit } from '@morphllm/morphsdk';
import { EXISTING_CODE_MARKER } from './constants';
import {
	buildApplyConfig,
	type MorphApplyDefaultModel,
	type MorphRuntimeConfig,
	type MorphSdkPatchStatus,
} from './runtime-config';

export interface QuickEditDetails {
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
}

export interface ResolvedWorkspaceFile {
	requestedPath: string;
	absolutePath: string;
}

export async function resolveWorkspaceFilePath(
	workspaceCwd: string,
	inputPath: string,
): Promise<ResolvedWorkspaceFile> {
	const requestedPath = resolve(await realpath(workspaceCwd), expandPath(inputPath));
	return { requestedPath, absolutePath: await realpath(requestedPath) };
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
	if (!codeEdit.includes(EXISTING_CODE_MARKER)) {
		throw new Error(
			`Missing '${EXISTING_CODE_MARKER}' markers for an existing ${countLines(originalCode)}-line file. Use quick_edit only for sparse edits with markers; use write for full-file replacement.`,
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
