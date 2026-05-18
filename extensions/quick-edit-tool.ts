import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { highlightCode, withFileMutationQueue } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
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
import { ensureMorphApiKey } from './auth';
import {
	countLines,
	ensureReadableFile,
	type QuickEditDetails,
	resolveWorkspaceFilePath,
	runMorphApply,
	summarizeResult,
	validateInputForExistingFile,
	validateMergedOutput,
} from './morph-apply';
import { getMorphRuntimeConfig } from './runtime-config';

const QuickEditParams = Type.Object({
	path: Type.String({ description: 'Path to a workspace file to create or modify (relative or absolute).' }),
	instruction: Type.String({
		description: "A first-person change description. Example: 'I am adding input validation to the add function.'",
	}),
	codeEdit: Type.String({
		description:
			"Only the changed lines plus enough surrounding context to anchor each change. Everything else MUST be a '// ... existing code ...' marker — never repeat unchanged content. Use one marker per skipped region, no limit. Markers work inline too: 'KEY = // ... existing value ...' leaves the value untouched. For reordering rows or blocks, list the new order and use a marker for each row's unchanged content.",
	}),
});

export function registerQuickEditTool(pi: ExtensionAPI): void {
	pi.registerTool<typeof QuickEditParams, Partial<QuickEditDetails>>({
		name: 'quick_edit',
		label: 'Quick Edit',
		description:
			"Default tool for editing workspace files. Supply only the changed sections wrapped in '// ... existing code ...' markers — Morph fills the unchanged parts. Use for: any scattered or large edit, reorganizing table rows or config entries without retyping all values, moving or regrouping blocks, complex refactors, or anything where exact string matching would be fragile. Creates the file directly if it does not exist. Fall back to edit only when quick_edit fails or an exact local replacement is explicitly required.",
		promptSnippet:
			'quick_edit: default file editor. Supply only changed sections with markers. Fallback: edit for guaranteed exact replacement.',
		parameters: QuickEditParams,

		renderCall(args, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);
			const filePath = args.path ?? '';
			const instruction = args.instruction ?? '';
			const codeEdit = args.codeEdit ?? '';
			const language = diffLang(filePath);
			const home = process.env['HOME'] ?? '';

			const hdr =
				`${theme.fg('toolTitle', theme.bold('quick_edit'))} ${theme.fg('accent', shortPath(context.cwd, home, filePath))}` +
				(instruction ? `\n${theme.fg('muted', instruction)}` : '');
			const maxShow = cfg.maxPreviewLines;
			const isFinal = context.argsComplete || !context.isPartial;

			// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- context.state is any by design
			const st = context.state as {
				_msk?: string | null;
				_mst?: string | null;
				_mpk?: string | null;
				_mpt?: string | null;
			};

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
							if (rem > 0) out += `\n${theme.fg('muted', `… ${rem} more lines`)}`;
							st._mst = out;
							context.invalidate();
						})
						.catch(() => {});
				}
				text.setText(st._mst ?? `${hdr}  ${theme.fg('muted', `(${n} lines…)`)}`);
				return text;
			}

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
							if (rem > 0) out += `\n${theme.fg('muted', `… (${rem} more lines, ${hlLines.length} total)`)}`;
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

		renderResult(result, { isPartial }, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);

			if (isPartial) {
				const first = result.content[0];
				const raw = first != null && first.type === 'text' ? first.text : '';
				text.setText(theme.fg('warning', raw !== '' ? raw : 'Running Morph merge...'));
				return text;
			}

			if (context.isError) {
				const first = result.content[0];
				const errorMsg = first != null && first.type === 'text' ? first.text : 'Unknown error';
				const header =
					theme.fg('error', '✘') +
					' ' +
					theme.fg('toolTitle', theme.bold('quick_edit')) +
					' ' +
					theme.fg('error', 'failed');
				text.setText([header, theme.fg('error', errorMsg)].join('\n'));
				return text;
			}

			const details = result.details;
			const changes = details.changes;
			const filePath = details.path ?? '';

			const latency = details.latencyMs != null ? `${details.latencyMs}ms` : null;
			const changeSummary = changes
				? theme.fg('success', `+${changes.linesAdded}`) + '/' + theme.fg('error', `-${changes.linesRemoved}`)
				: null;

			const header =
				theme.fg('success', '✔') +
				' ' +
				theme.fg('toolTitle', theme.bold('quick_edit')) +
				': ' +
				theme.fg('accent', filePath);

			const collapsedParts: (string | null)[] = [header, changeSummary];
			if (latency != null) collapsedParts.push(theme.fg('dim', `(${latency})`));

			const changeLine = changes
				? theme.fg('success', `+${changes.linesAdded}`) +
					' ' +
					theme.fg('error', `-${changes.linesRemoved}`) +
					' ' +
					theme.fg('muted', `~${changes.linesModified}`)
				: '';

			if (!context.expanded) {
				text.setText(collapsedParts.filter(Boolean).join(' '));
				return text;
			}

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

			const udiff = details.udiff ?? '';
			const diffLines = udiff ? highlightCode(udiff, 'diff').join('\n') : theme.fg('dim', '(no diff available)');
			text.setText([header, changeLine, '', diffLines].filter((line) => line !== undefined).join('\n'));
			return text;
		},

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const apiKey = await ensureMorphApiKey(ctx.modelRegistry.authStorage);
			const runtimeConfig = await getMorphRuntimeConfig();
			let absolutePath: string;

			try {
				({ absolutePath } = await resolveWorkspaceFilePath(ctx.cwd, params.path));
			} catch (error) {
				if (error instanceof Error && error.message.startsWith('quick_edit ')) throw error;
				const targetPath = params.path.startsWith('@') ? params.path.slice(1) : params.path;
				const fallbackPath = resolve(ctx.cwd, targetPath);
				throw new Error(`quick_edit: cannot resolve path ${params.path}\nResolved to: ${fallbackPath}`);
			}

			onUpdate?.({ content: [{ type: 'text', text: `Preparing Morph edit for ${params.path}...` }], details: {} });

			return withFileMutationQueue(absolutePath, async () => {
				let isNewFile = false;
				try {
					await ensureReadableFile(absolutePath);
				} catch {
					isNewFile = true;
				}

				// New file: write codeEdit directly — no API round-trip on empty original.
				if (isNewFile) {
					await mkdir(dirname(absolutePath), { recursive: true });
					await writeFile(absolutePath, params.codeEdit, 'utf8');
					return {
						content: [{ type: 'text' as const, text: `Created ${params.path}` }],
						details: {
							provider: 'direct',
							path: params.path,
							absolutePath,
							dryRun: false,
							instruction: params.instruction,
							changes: { linesAdded: params.codeEdit.split('\n').length, linesRemoved: 0, linesModified: 0 },
							udiff: undefined,
							mergedCode: params.codeEdit,
							originalCode: '',
							completionId: undefined,
							originalLineCount: 0,
							mergedLineCount: params.codeEdit.split('\n').length,
							apiBaseUrl: runtimeConfig.displayApiBaseUrl,
							apiBaseUrlHost: runtimeConfig.apiBaseUrlHost,
							apiBaseUrlCustomHost: runtimeConfig.apiBaseUrlCustomHost,
							timeoutMs: runtimeConfig.timeoutMs,
							applyDefaultModel: runtimeConfig.applyDefaultModel,
							sdkApplyPatchStatus: runtimeConfig.sdkPatch.status,
							sdkVersion: runtimeConfig.sdkPatch.version,
						} satisfies QuickEditDetails,
					};
				}

				const originalCode = await readFile(absolutePath, 'utf8');
				validateInputForExistingFile(params.codeEdit, originalCode);

				onUpdate?.({ content: [{ type: 'text', text: `Running Morph merge for ${params.path}...` }], details: {} });

				const morphStart = Date.now();
				const result = await runMorphApply(
					{
						originalCode,
						codeEdit: params.codeEdit,
						instruction: params.instruction,
					},
					apiKey,
					runtimeConfig,
				);

				const latencyMs = Date.now() - morphStart;

				if (!result.success || result.mergedCode == null || result.mergedCode === '') {
					const errorMessage =
						result.error == null || result.error === '' ? 'Morph did not produce merged output.' : result.error;
					throw new Error(errorMessage);
				}

				validateMergedOutput(originalCode, params.codeEdit, result.mergedCode);
				await writeFile(absolutePath, result.mergedCode, 'utf8');

				return {
					content: [
						{
							type: 'text',
							text: summarizeResult(params.path, false, result.changes, result.udiff),
						},
					],
					details: {
						provider: 'sdk',
						path: params.path,
						absolutePath,
						dryRun: false,
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
						latencyMs,
					} satisfies QuickEditDetails,
				};
			});
		},
	});
}
