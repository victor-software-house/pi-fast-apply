import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { withFileMutationQueue } from '@mariozechner/pi-coding-agent';
import type { ApplyEditConfig, ApplyEditInput, ApplyEditResult, EditChanges } from '@morphllm/morphsdk';
import { applyEdit } from '@morphllm/morphsdk';
import { Type } from '@sinclair/typebox';

const EXISTING_CODE_MARKER = '// ... existing code ...';
const DEFAULT_MORPH_API_URL = 'https://api.morphllm.com';
const DEFAULT_TIMEOUT_MS = parsePositiveInt(process.env['MORPH_EDIT_TIMEOUT_MS'], 60_000);
const NON_TRIVIAL_FILE_LINE_COUNT = 10;

const MorphEditParams = Type.Object({
	path: Type.String({ description: 'Path to the existing file to modify (relative or absolute)' }),
	instruction: Type.String({
		description:
			"A single first-person sentence describing what you are changing. Example: 'I am adding error handling to the login flow.'",
	}),
	codeEdit: Type.String({
		description:
			"Partial edit using '// ... existing code ...' markers for unchanged sections. Preserve exact indentation.",
	}),
	dryRun: Type.Optional(Type.Boolean({ description: 'Preview the Morph merge without writing the file.' })),
});

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (value == null || value.trim() === '') {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getMorphApiBaseUrl(): string {
	const configuredBaseUrl = process.env['MORPH_API_URL']?.trim();
	const raw = configuredBaseUrl == null || configuredBaseUrl === '' ? DEFAULT_MORPH_API_URL : configuredBaseUrl;
	return raw.replace(/\/+$/, '').replace(/\/v1$/, '');
}

function stripLeadingAt(path: string): string {
	return path.startsWith('@') ? path.slice(1) : path;
}

function countLines(text: string): number {
	return text.length === 0 ? 0 : text.split('\n').length;
}

function buildApplyConfig(apiKey: string): ApplyEditConfig {
	return {
		morphApiKey: apiKey,
		morphApiUrl: getMorphApiBaseUrl(),
		timeout: DEFAULT_TIMEOUT_MS,
		generateUdiff: true,
	};
}

function ensureMorphConfigured(): string {
	const apiKey = process.env['MORPH_API_KEY']?.trim();
	if (apiKey == null || apiKey === '') {
		throw new Error('MORPH_API_KEY is not configured. Set it in the environment before using morph_edit.');
	}

	return apiKey;
}

async function ensureReadableFile(absolutePath: string): Promise<void> {
	await access(absolutePath, constants.R_OK);
}

function validateInputForExistingFile(codeEdit: string, originalCode: string): void {
	const originalLines = countLines(originalCode);
	if (originalLines > NON_TRIVIAL_FILE_LINE_COUNT && !codeEdit.includes(EXISTING_CODE_MARKER)) {
		throw new Error(
			`Missing '${EXISTING_CODE_MARKER}' markers for an existing ${originalLines}-line file. Use morph_edit for partial edits with markers, or use write for full replacement.`,
		);
	}
}

function validateMergedOutput(originalCode: string, codeEdit: string, mergedCode: string): void {
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

function summarizeResult(relativePath: string, dryRun: boolean, changes: EditChanges): string {
	const mode = dryRun ? 'Morph dry run' : 'Morph edit applied';
	return [
		`${mode}: ${relativePath}`,
		`Provider: sdk`,
		`Changes: +${changes.linesAdded} -${changes.linesRemoved} ~${changes.linesModified}`,
		dryRun
			? 'No file was written. Inspect details.udiff or details.mergedCode for the preview.'
			: 'File updated. Use the read tool if you need to inspect the resulting file contents.',
	].join('\n');
}

async function runMorphApply(input: ApplyEditInput, apiKey: string): Promise<ApplyEditResult> {
	return applyEdit(input, buildApplyConfig(apiKey));
}

export default function morphEditExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: 'morph_edit',
		label: 'Morph Edit',
		description:
			'Edit an existing file using Morph Fast Apply semantics. Best for large files, multiple scattered edits, or whitespace-sensitive changes.',
		promptSnippet:
			'Use morph_edit for large or scattered edits in existing files. Use edit for small exact replacements and write for new files.',
		promptGuidelines: [
			'Use morph_edit when exact oldText matching would be fragile or when several disjoint edits belong in one file.',
			"Always provide a first-person instruction and use '// ... existing code ...' markers for unchanged sections.",
			'Use write instead of morph_edit for new files or full-file replacement.',
		],
		parameters: MorphEditParams,
		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const apiKey = ensureMorphConfigured();
			const targetPath = stripLeadingAt(params.path);
			const absolutePath = resolve(ctx.cwd, targetPath);
			const dryRun = Boolean(params.dryRun);

			onUpdate?.({ content: [{ type: 'text', text: `Preparing Morph edit for ${targetPath}...` }], details: {} });

			return withFileMutationQueue(absolutePath, async () => {
				try {
					await ensureReadableFile(absolutePath);
				} catch {
					throw new Error(
						`Target file does not exist or is not readable: ${targetPath}. Use write to create new files.`,
					);
				}

				const originalCode = await readFile(absolutePath, 'utf8');
				validateInputForExistingFile(params.codeEdit, originalCode);

				onUpdate?.({ content: [{ type: 'text', text: `Running Morph merge for ${targetPath}...` }], details: {} });

				const result = await runMorphApply(
					{
						originalCode,
						codeEdit: params.codeEdit,
						instruction: params.instruction,
					},
					apiKey,
				);

				if (!result.success || result.mergedCode == null || result.mergedCode === '') {
					const errorMessage =
						result.error == null || result.error === '' ? 'Morph did not produce merged output.' : result.error;
					throw new Error(errorMessage);
				}

				validateMergedOutput(originalCode, params.codeEdit, result.mergedCode);
				if (!dryRun) {
					await mkdir(dirname(absolutePath), { recursive: true });
					await writeFile(absolutePath, result.mergedCode, 'utf8');
				}

				return {
					content: [
						{
							type: 'text',
							text: summarizeResult(targetPath, dryRun, result.changes),
						},
					],
					details: {
						provider: 'sdk',
						path: targetPath,
						absolutePath,
						dryRun,
						instruction: params.instruction,
						changes: result.changes,
						udiff: result.udiff,
						mergedCode: result.mergedCode,
						completionId: result.completionId,
						originalLineCount: countLines(originalCode),
						mergedLineCount: countLines(result.mergedCode),
					},
				};
			});
		},
	});

	pi.registerCommand('morph-status', {
		description: 'Show Morph extension status and configuration hints',
		handler: async (_args, ctx) => {
			const apiKeyConfigured = Boolean(process.env['MORPH_API_KEY']?.trim());
			const lines = [
				'Morph extension status',
				`- MORPH_API_KEY: ${apiKeyConfigured ? 'configured' : 'missing'}`,
				'- Fast Apply provider: official Morph SDK',
				`- API base URL: ${getMorphApiBaseUrl()}`,
				`- Timeout: ${DEFAULT_TIMEOUT_MS}ms`,
			];
			ctx.ui.notify(lines.join('\n'), apiKeyConfigured ? 'info' : 'warning');
		},
	});
}
