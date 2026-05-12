import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import type { AuthStorage, ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { highlightCode, withFileMutationQueue } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import type { ApplyEditConfig, ApplyEditInput, ApplyEditResult, EditChanges } from '@morphllm/morphsdk';
import { applyEdit } from '@morphllm/morphsdk';
import { Type } from '@sinclair/typebox';
import {
	cfg,
	type DiffColors,
	lang as diffLang,
	hlBlock,
	parseDiff,
	renderSplit,
	resolveDiffColors,
	shortPath,
	termW,
} from 'pi-diff/render';

const EXISTING_CODE_MARKER = '// ... existing code ...';
const DEFAULT_MORPH_API_URL = 'https://api.morphllm.com';
const DEFAULT_TIMEOUT_MS = parsePositiveInt(process.env['MORPH_EDIT_TIMEOUT_MS'], 60_000);
const NON_TRIVIAL_FILE_LINE_COUNT = 10;

/**
 * Provider identifier used as the auth.json key for Morph credentials.
 * Pi's built-in env var mapping does not include Morph, so we resolve
 * MORPH_API_KEY explicitly as a fallback after checking authStorage.
 */
const MORPH_PROVIDER_ID = 'morph';
const MORPH_ENV_VAR = 'MORPH_API_KEY';

const FastApplyParams = Type.Object({
	path: Type.String({ description: 'Path to the existing file to modify (relative or absolute)' }),
	instruction: Type.String({
		description: "A first-person change description. Example: 'I am adding input validation to the add function.'",
	}),
	codeEdit: Type.String({
		description:
			"Partial edit containing only the changed sections, wrapped with '// ... existing code ...' markers. Include enough unique surrounding context to anchor each change precisely and preserve exact indentation.",
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

function expandPath(filePath: string): string {
	const normalized = filePath.startsWith('@') ? filePath.slice(1) : filePath;
	if (normalized === '~') return homedir();
	if (normalized.startsWith('~/')) return homedir() + normalized.slice(1);
	return normalized;
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

/**
 * Auth source for operator-visible diagnostics.
 */
type MorphAuthSource = 'auth.json' | 'env' | 'none';

/**
 * Resolve the Morph API key using Pi's auth priority chain:
 *   1. authStorage (runtime override or auth.json via /morph-login)
 *   2. MORPH_API_KEY environment variable
 *
 * Pi's built-in getEnvApiKey() hardcodes known providers and does not
 * include 'morph', so step 2 is an explicit env-var check rather than
 * relying on authStorage's env fallback.
 */
async function resolveMorphApiKey(authStorage: AuthStorage): Promise<{ key: string; source: MorphAuthSource }> {
	// 1. authStorage: runtime override or persisted api_key in auth.json
	const storedKey = await authStorage.getApiKey(MORPH_PROVIDER_ID, { includeFallback: false });
	if (storedKey != null && storedKey !== '') {
		return { key: storedKey, source: 'auth.json' };
	}

	// 2. Explicit env var fallback
	const envKey = process.env[MORPH_ENV_VAR]?.trim();
	if (envKey != null && envKey !== '') {
		return { key: envKey, source: 'env' };
	}

	return { key: '', source: 'none' };
}

/**
 * Resolve and require a Morph API key, throwing a descriptive error when missing.
 */
async function ensureMorphApiKey(authStorage: AuthStorage): Promise<string> {
	const { key, source } = await resolveMorphApiKey(authStorage);
	if (source === 'none') {
		throw new Error(
			'Morph API key is not configured.\n' +
				'Use /morph-login to store a key in Pi, or set MORPH_API_KEY in the environment.',
		);
	}
	return key;
}

async function ensureReadableFile(absolutePath: string): Promise<void> {
	await access(absolutePath, constants.R_OK);
}

function validateInputForExistingFile(codeEdit: string, originalCode: string): void {
	const originalLines = countLines(originalCode);
	if (originalLines > NON_TRIVIAL_FILE_LINE_COUNT && !codeEdit.includes(EXISTING_CODE_MARKER)) {
		throw new Error(
			`Missing '${EXISTING_CODE_MARKER}' markers for an existing ${originalLines}-line file. Use fast_apply for partial edits with markers, or use write for full replacement.`,
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

interface FastApplyDetails {
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
}

function summarizeResult(
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

async function runMorphApply(input: ApplyEditInput, apiKey: string): Promise<ApplyEditResult> {
	return applyEdit(input, buildApplyConfig(apiKey));
}

export default function fastApplyExtension(pi: ExtensionAPI): void {
	pi.registerTool<typeof FastApplyParams, Partial<FastApplyDetails>>({
		name: 'fast_apply',
		label: 'Fast Apply',
		description:
			"Edit an existing file using partial code snippets with '// ... existing code ...' markers. Use fast_apply for multiple scattered changes in one existing file, complex refactors, or edits where exact oldText matching would be fragile. Use edit for small exact replacements and write for new files.",
		promptSnippet:
			'Use fast_apply for scattered or fragile edits in existing files; use edit for small exact replacements and write for new files.',
		promptGuidelines: [
			"Write instruction in first person and make it specific, for example: 'I am adding input validation to the add function.'",
			"In codeEdit, include only the changed sections and wrap unchanged sections with '// ... existing code ...' markers instead of rewriting the whole file.",
			'Include enough unique surrounding context to anchor each change precisely, preserve exact indentation, and use edit instead when the change is just a small exact replacement.',
		],
		parameters: FastApplyParams,

		renderCall(args, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);
			const filePath = args.path ?? '';
			const instruction = args.instruction ?? '';
			const codeEdit = args.codeEdit ?? '';
			const language = diffLang(filePath);
			const home = process.env['HOME'] ?? '';

			const hdr =
				`${theme.fg('toolTitle', theme.bold('fast_apply'))} ${theme.fg('accent', shortPath(context.cwd, home, filePath))}` +
				(instruction ? `\n${theme.fg('muted', instruction)}` : '');
			const maxShow = cfg.maxPreviewLines;
			// Pi never calls setArgsComplete() for historical tool calls on session resume.
			// Use !context.isPartial (result present) as a fallback signal that args are done.
			const isFinal = context.argsComplete || !context.isPartial;

			// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- context.state is any by design
			const st = context.state as {
				_msk?: string | null;
				_mst?: string | null;
				_mpk?: string | null;
				_mpt?: string | null;
			};

			// Streaming — show live preview as codeEdit arrives
			if (codeEdit && !isFinal) {
				const lines = codeEdit.split('\n');
				const n = lines.length;
				const ex = context.expanded ? 1 : 0;
				const streamKey = `morphstream:${filePath}:${codeEdit.length}:${ex}:${theme.name}`;
				if (st._msk !== streamKey) {
					st._msk = streamKey;
					const preview = lines.slice(0, context.expanded ? n : maxShow);
					hlBlock(preview.join('\n'), language)
						.then((hlLines: string[]) => {
							if (st._msk !== streamKey) return;
							const rem = n - (context.expanded ? n : maxShow);
							let out = `${hdr}\n\n${hlLines.join('\n')}`;
							if (rem > 0) out += `\n${theme.fg('muted', `\u2026 ${rem} more lines`)}`;
							st._mst = out;
							context.invalidate();
						})
						.catch(() => {});
				}
				text.setText(st._mst ?? `${hdr}  ${theme.fg('muted', `(${n} lines\u2026)`)}`);
				return text;
			}

			// Final render — full syntax-highlighted codeEdit, truncated to maxShow unless expanded
			if (codeEdit && isFinal) {
				st._msk = null;
				st._mst = null;
				const ex = context.expanded ? 1 : 0;
				const previewKey = `morphfinal:${filePath}:${codeEdit.length}:${ex}:${theme.name}`;
				if (st._mpk !== previewKey) {
					st._mpk = previewKey;
					st._mpt = hdr;
					hlBlock(codeEdit, language)
						.then((hlLines: string[]) => {
							if (st._mpk !== previewKey) return;
							const show = context.expanded ? hlLines.length : maxShow;
							const preview = hlLines.slice(0, show).join('\n');
							const rem = hlLines.length - show;
							let out = `${hdr}\n\n${preview}`;
							if (rem > 0) out += `\n${theme.fg('muted', `\u2026 (${rem} more lines, ${hlLines.length} total)`)}`;
							st._mpt = out;
							context.invalidate();
						})
						.catch(() => {});
				}
				text.setText(st._mpt ?? hdr);
				return text;
			}

			text.setText(hdr);
			return text;
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);

			if (isPartial) {
				const first = result.content[0];
				const raw = first != null && first.type === 'text' ? first.text : '';
				text.setText(theme.fg('warning', raw !== '' ? raw : 'Running Morph merge...'));
				return text;
			}

			// Error state — show the error message clearly
			if (context.isError) {
				const first = result.content[0];
				const errorMsg = first != null && first.type === 'text' ? first.text : 'Unknown error';
				const header =
					theme.fg('error', '\u2718') +
					' ' +
					theme.fg('toolTitle', theme.bold('fast_apply')) +
					' ' +
					theme.fg('error', 'failed');
				text.setText([header, theme.fg('error', errorMsg)].join('\n'));
				return text;
			}

			const details = result.details;

			const changes = details.changes;
			const filePath = details.path ?? '';
			const dryRun = details.dryRun ?? false;

			const modeLabel = dryRun ? 'dry run' : 'applied';
			const header =
				theme.fg('success', '\u2714') +
				' ' +
				theme.fg('toolTitle', theme.bold('fast_apply')) +
				' ' +
				theme.fg('accent', filePath) +
				' ' +
				theme.fg('dim', modeLabel);

			const changeLine = changes
				? theme.fg('success', `+${changes.linesAdded}`) +
					' ' +
					theme.fg('error', `-${changes.linesRemoved}`) +
					' ' +
					theme.fg('muted', `~${changes.linesModified}`)
				: '';

			if (!expanded) {
				text.setText([header, changeLine].filter(Boolean).join('  '));
				return text;
			}

			// Expanded: full split/unified diff via pi-diff rendering engine
			const originalCode: string | undefined = details.originalCode;
			const mergedCode: string | undefined = details.mergedCode;

			if (originalCode != null && mergedCode != null && originalCode !== mergedCode) {
				// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Pi context.state is typed as any by design
				const st = context.state as { _morphDiffKey?: string; _morphDiffText?: string };
				const w = termW();
				const ex = context.expanded ? 1 : 0;
				const language = diffLang(details.absolutePath ?? filePath);
				const diff = parseDiff(originalCode, mergedCode);
				const key = `morph:${w}:${diff.added}:${diff.removed}:${diff.lines.length}:${language ?? ''}:${ex}:${theme.name}`;

				if (st._morphDiffKey !== key) {
					st._morphDiffKey = key;
					st._morphDiffText = [header, changeLine, '', theme.fg('muted', '  rendering diff...')]
						.filter(Boolean)
						.join('\n');

					const dc: DiffColors = resolveDiffColors(theme);
					const maxLines = context.expanded ? diff.lines.length : cfg.maxDiffLines;
					const wr = context.expanded ? (cfg.maxWrapRows ?? 10) : undefined;
					renderSplit(diff, language, maxLines, dc, wr)
						.then((rendered: string) => {
							if (st._morphDiffKey !== key) return;
							st._morphDiffText = [header, changeLine, '', rendered].filter(Boolean).join('\n');
							context.invalidate();
						})
						.catch(() => {
							if (st._morphDiffKey !== key) return;
							st._morphDiffText = [header, changeLine].filter(Boolean).join('  ');
							context.invalidate();
						});
				}

				text.setText(st._morphDiffText ?? [header, changeLine].filter(Boolean).join('  '));
				return text;
			}

			// Fallback: no original code available (e.g. dry run without file read)
			const udiff = details.udiff ?? '';
			const diffLines = udiff ? highlightCode(udiff, 'diff').join('\n') : theme.fg('dim', '(no diff available)');
			text.setText([header, changeLine, '', diffLines].filter((l) => l !== undefined).join('\n'));
			return text;
		},

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const apiKey = await ensureMorphApiKey(ctx.modelRegistry.authStorage);
			const targetPath = expandPath(params.path);
			const absolutePath = resolve(ctx.cwd, targetPath);
			const dryRun = Boolean(params.dryRun);

			onUpdate?.({ content: [{ type: 'text', text: `Preparing Morph edit for ${targetPath}...` }], details: {} });

			return withFileMutationQueue(absolutePath, async () => {
				try {
					await ensureReadableFile(absolutePath);
				} catch {
					throw new Error(
						`File not found: ${params.path}\nResolved to: ${absolutePath}\nUse the write tool to create new files.`,
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
							text: summarizeResult(targetPath, dryRun, result.changes, result.udiff),
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
						originalCode,
						completionId: result.completionId,
						originalLineCount: countLines(originalCode),
						mergedLineCount: countLines(result.mergedCode),
					},
				};
			});
		},
	});

	pi.registerCommand('morph-login', {
		description: 'Store a Morph API key in Pi auth storage',
		handler: async (_args, ctx) => {
			const key = _args.trim();
			if (key === '') {
				ctx.ui.notify(
					'Usage: /morph-login <api-key>\n' +
						'Store a Morph API key in Pi auth storage (~/.pi/agent/auth.json).\n' +
						'The key takes priority over the MORPH_API_KEY environment variable.',
					'warning',
				);
				return;
			}

			ctx.modelRegistry.authStorage.set(MORPH_PROVIDER_ID, { type: 'api_key', key });
			ctx.ui.notify('Morph API key stored in Pi auth storage.', 'info');
		},
	});

	pi.registerCommand('morph-logout', {
		description: 'Remove stored Morph API key from Pi auth storage',
		handler: async (_args, ctx) => {
			const had = ctx.modelRegistry.authStorage.has(MORPH_PROVIDER_ID);
			if (!had) {
				ctx.ui.notify('No Morph credentials found in Pi auth storage.', 'info');
				return;
			}

			ctx.modelRegistry.authStorage.remove(MORPH_PROVIDER_ID);
			ctx.ui.notify('Morph API key removed from Pi auth storage.', 'info');
		},
	});

	pi.registerCommand('morph-status', {
		description: 'Show Morph extension status and configuration hints',
		handler: async (_args, ctx) => {
			const { source } = await resolveMorphApiKey(ctx.modelRegistry.authStorage);
			const authLabel =
				source === 'auth.json'
					? 'auth.json (via /morph-login)'
					: source === 'env'
						? 'MORPH_API_KEY environment variable'
						: 'not configured';
			const lines = [
				'Morph extension status',
				`- API key: ${authLabel}`,
				'- Fast Apply provider: official Morph SDK',
				`- API base URL: ${getMorphApiBaseUrl()}`,
				`- Timeout: ${DEFAULT_TIMEOUT_MS}ms`,
				'',
				'Auth resolution priority:',
				'  1. Pi auth storage (~/.pi/agent/auth.json) — set via /morph-login',
				'  2. MORPH_API_KEY environment variable (e.g. fnox, .env, shell export)',
			];
			ctx.ui.notify(lines.join('\n'), source !== 'none' ? 'info' : 'warning');
		},
	});
}
