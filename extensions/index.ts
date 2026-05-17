import { constants } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
const DEFAULT_MORPH_API_HOST = 'api.morphllm.com';
const CUSTOM_MORPH_API_URL_OPT_IN = 'MORPH_ALLOW_CUSTOM_API_URL';
const DEFAULT_TIMEOUT_MS = 60_000;
const NON_TRIVIAL_FILE_LINE_COUNT = 10;
const MORPH_SDK_PACKAGE = '@morphllm/morphsdk';
const MORPH_APPLY_DEFAULT_MODEL = 'auto';
const MORPH_APPLY_MODEL_TYPE_MARKER = "model?: 'auto' | 'morph-v3-fast' | 'morph-v3-large'";
const moduleRequire = createRequire(import.meta.url);

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

function resolveMorphApiBaseUrl(): {
	value: string;
	displayValue: string;
	source: MorphConfigSource;
	host: string;
	customHost: boolean;
} {
	const configuredBaseUrl = process.env['MORPH_API_URL']?.trim();
	const source: MorphConfigSource = configuredBaseUrl == null || configuredBaseUrl === '' ? 'default' : 'env';
	const raw = source === 'default' ? DEFAULT_MORPH_API_URL : (configuredBaseUrl ?? DEFAULT_MORPH_API_URL);
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error('MORPH_API_URL must be a valid absolute URL.');
	}

	if (url.protocol !== 'https:') {
		throw new Error('MORPH_API_URL must use https.');
	}
	if (url.username !== '' || url.password !== '') {
		throw new Error('MORPH_API_URL must not include embedded credentials.');
	}
	if (url.search !== '' || url.hash !== '') {
		throw new Error('MORPH_API_URL must not include query strings or fragments.');
	}

	const customHost = url.hostname !== DEFAULT_MORPH_API_HOST;
	if (customHost && process.env[CUSTOM_MORPH_API_URL_OPT_IN] !== '1') {
		throw new Error(
			`Refusing custom MORPH_API_URL host '${url.hostname}'. ` +
				`Set ${CUSTOM_MORPH_API_URL_OPT_IN}=1 only for trusted test endpoints.`,
		);
	}

	url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
	const value = url.toString().replace(/\/$/, '');
	return {
		value,
		displayValue: value,
		source,
		host: url.hostname,
		customHost,
	};
}

function resolveMorphTimeout(): { value: number; source: MorphConfigSource } {
	const configuredTimeout = process.env['MORPH_EDIT_TIMEOUT_MS']?.trim();
	return {
		value: parsePositiveInt(configuredTimeout, DEFAULT_TIMEOUT_MS),
		source: configuredTimeout == null || configuredTimeout === '' ? 'default' : 'env',
	};
}

function readJsonStringField(rawJson: string, fieldName: string): string | undefined {
	const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`);
	return pattern.exec(rawJson)?.[1];
}

function getErrorCode(error: unknown): string | undefined {
	if (error == null || typeof error !== 'object' || !('code' in error)) return undefined;
	return typeof error.code === 'string' ? error.code : undefined;
}

async function readMorphSdkPatchInfo(): Promise<MorphSdkPatchInfo> {
	try {
		let directory = dirname(moduleRequire.resolve(MORPH_SDK_PACKAGE));
		for (let depth = 0; depth < 8; depth++) {
			const packageJsonPath = resolve(directory, 'package.json');
			try {
				const packageJson = await readFile(packageJsonPath, 'utf8');
				if (readJsonStringField(packageJson, 'name') === MORPH_SDK_PACKAGE) {
					const packageRoot = directory;
					const version = readJsonStringField(packageJson, 'version') ?? 'unknown';
					const typeText = await readFile(resolve(packageRoot, 'dist/tools/fastapply/types.d.ts'), 'utf8');
					const runtimeText = await readFile(resolve(packageRoot, 'dist/tools/fastapply/apply.cjs'), 'utf8');
					const hasAutoType = typeText.includes(MORPH_APPLY_MODEL_TYPE_MARKER);
					const hasAutoRuntime = runtimeText.includes('MORPH_APPLY_MODEL') && runtimeText.includes('"auto"');
					return {
						packageName: MORPH_SDK_PACKAGE,
						version,
						status: hasAutoType && hasAutoRuntime ? 'auto-default-available' : 'auto-default-not-detected',
						detail:
							hasAutoType && hasAutoRuntime
								? 'installed SDK exposes model auto and defaults omitted Apply model to auto'
								: 'installed SDK does not expose the expected auto-default patch markers',
					};
				}
			} catch (error) {
				if (getErrorCode(error) !== 'ENOENT') throw error;
			}

			const parent = dirname(directory);
			if (parent === directory) break;
			directory = parent;
		}
	} catch (error) {
		return {
			packageName: MORPH_SDK_PACKAGE,
			version: 'unknown',
			status: 'unknown',
			detail: error instanceof Error ? error.message : String(error),
		};
	}

	return {
		packageName: MORPH_SDK_PACKAGE,
		version: 'unknown',
		status: 'unknown',
		detail: 'package root not found from runtime resolver',
	};
}

async function getMorphRuntimeConfig(): Promise<MorphRuntimeConfig> {
	cachedRuntimeConfig ??= (async () => {
		const apiBaseUrl = resolveMorphApiBaseUrl();
		const timeout = resolveMorphTimeout();
		return {
			apiBaseUrl: apiBaseUrl.value,
			displayApiBaseUrl: apiBaseUrl.displayValue,
			apiBaseUrlSource: apiBaseUrl.source,
			apiBaseUrlHost: apiBaseUrl.host,
			apiBaseUrlCustomHost: apiBaseUrl.customHost,
			timeoutMs: timeout.value,
			timeoutSource: timeout.source,
			applyDefaultModel: MORPH_APPLY_DEFAULT_MODEL,
			sdkPatch: await readMorphSdkPatchInfo(),
		};
	})();
	return cachedRuntimeConfig;
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

function buildApplyConfig(apiKey: string, runtimeConfig: MorphRuntimeConfig): ApplyEditConfig {
	return {
		morphApiKey: apiKey,
		morphApiUrl: runtimeConfig.apiBaseUrl,
		timeout: runtimeConfig.timeoutMs,
		generateUdiff: true,
	};
}

/**
 * Auth source for operator-visible diagnostics.
 */
type MorphAuthSource = 'auth.json' | 'env' | 'none';
type MorphConfigSource = 'default' | 'env';
type MorphApplyDefaultModel = typeof MORPH_APPLY_DEFAULT_MODEL;
type MorphSdkPatchStatus = 'auto-default-available' | 'auto-default-not-detected' | 'unknown';

interface MorphSdkPatchInfo {
	packageName: string;
	version: string;
	status: MorphSdkPatchStatus;
	detail: string;
}

interface MorphRuntimeConfig {
	apiBaseUrl: string;
	displayApiBaseUrl: string;
	apiBaseUrlSource: MorphConfigSource;
	apiBaseUrlHost: string;
	apiBaseUrlCustomHost: boolean;
	timeoutMs: number;
	timeoutSource: MorphConfigSource;
	applyDefaultModel: MorphApplyDefaultModel;
	sdkPatch: MorphSdkPatchInfo;
}

let cachedRuntimeConfig: Promise<MorphRuntimeConfig> | undefined;

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
	apiBaseUrl: string;
	timeoutMs: number;
	applyDefaultModel: MorphApplyDefaultModel;
	sdkApplyPatchStatus: MorphSdkPatchStatus;
	sdkVersion: string;
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

async function runMorphApply(
	input: ApplyEditInput,
	apiKey: string,
	runtimeConfig: MorphRuntimeConfig,
): Promise<ApplyEditResult> {
	return applyEdit(input, buildApplyConfig(apiKey, runtimeConfig));
}

export default function fastApplyExtension(pi: ExtensionAPI): void {
	pi.registerTool<typeof FastApplyParams, Partial<FastApplyDetails>>({
		name: 'fast_apply',
		label: 'Fast Apply',
		description:
			"Edit an existing file using partial code snippets with '// ... existing code ...' markers. Markers can appear anywhere a unique anchor exists, including inline within a single line between two literal anchors \u2014 use them for huge or fragile values (ciphertexts, base64 blobs, JWTs, long URLs, multi-KB strings) instead of pasting the value into codeEdit. Use fast_apply for multiple scattered changes, complex refactors, line-by-line reorganizations of an existing file, or any case where exact oldText matching would be fragile. Use edit for small exact replacements and write for new files.",
		promptSnippet:
			"Use fast_apply for scattered/fragile edits and reorganizations in existing files. Use '// ... existing code ...' markers in place of any value already in the file (especially long ciphertexts, base64 blobs, or multi-KB strings) so you never have to retype them. Use edit for small exact replacements and write for new files.",
		promptGuidelines: [
			"Write instruction in first person and make it specific, for example: 'I am adding input validation to the add function.'",
			"In codeEdit, include only the changed sections and wrap unchanged sections with '// ... existing code ...' markers instead of rewriting the whole file.",
			"Use '// ... existing code ...' (or a more descriptive variant like '// ... existing inline table ...') for ANY value that already exists in the file and is long, fragile, or risky to retype \u2014 including age ciphertexts, JWTs, base64 blobs, long URLs, multi-line embedded JSON. The marker can appear inline within a single line between two unique literal anchors.",
			'For reorganizations that touch many lines (regrouping a config table, reordering function declarations), give each relocated line its own placeholder on the right-hand side and let Morph fill them in from the existing file. One marker per line scales fine; there is no built-in limit.',
			'Never paste a multi-KB value into codeEdit when a marker would work. Never fall back to a Python / Ruby / sed / awk rewrite script as a workaround for "too much to retype" \u2014 that is exactly the case the placeholder pattern was designed to cover.',
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
			const runtimeConfig = await getMorphRuntimeConfig();
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
					runtimeConfig,
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
						apiBaseUrl: runtimeConfig.displayApiBaseUrl,
						apiBaseUrlHost: runtimeConfig.apiBaseUrlHost,
						apiBaseUrlCustomHost: runtimeConfig.apiBaseUrlCustomHost,
						timeoutMs: runtimeConfig.timeoutMs,
						applyDefaultModel: runtimeConfig.applyDefaultModel,
						sdkApplyPatchStatus: runtimeConfig.sdkPatch.status,
						sdkVersion: runtimeConfig.sdkPatch.version,
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
			const [{ source }, runtimeConfig] = await Promise.all([
				resolveMorphApiKey(ctx.modelRegistry.authStorage),
				getMorphRuntimeConfig(),
			]);
			const authLabel =
				source === 'auth.json'
					? 'auth.json (via /morph-login)'
					: source === 'env'
						? 'MORPH_API_KEY environment variable'
						: 'not configured';
			const patchDetail =
				runtimeConfig.sdkPatch.status === 'unknown'
					? 'SDK patch status could not be determined'
					: runtimeConfig.sdkPatch.detail;
			const lines = [
				'Morph extension status',
				`- API key: ${authLabel}`,
				'- Fast Apply provider: official Morph SDK',
				`- API base URL: ${runtimeConfig.displayApiBaseUrl} (${runtimeConfig.apiBaseUrlSource})`,
				`- API base host: ${runtimeConfig.apiBaseUrlHost}${runtimeConfig.apiBaseUrlCustomHost ? ' (custom)' : ''}`,
				`- Timeout: ${runtimeConfig.timeoutMs}ms (${runtimeConfig.timeoutSource})`,
				`- SDK package: ${runtimeConfig.sdkPatch.packageName}@${runtimeConfig.sdkPatch.version}`,
				`- SDK Apply default: ${runtimeConfig.applyDefaultModel}`,
				`- SDK auto patch: ${runtimeConfig.sdkPatch.status}`,
				`- SDK patch detail: ${patchDetail}`,
				'',
				'Auth resolution priority:',
				'  1. Pi auth storage (~/.pi/agent/auth.json) — set via /morph-login',
				'  2. MORPH_API_KEY environment variable (e.g. fnox, .env, shell export)',
			];
			ctx.ui.notify(lines.join('\n'), source !== 'none' ? 'info' : 'warning');
		},
	});
}
