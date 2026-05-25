import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { highlightCode, withFileMutationQueue } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from '@sinclair/typebox';
import { getWidthAwareText } from '@victor-software-house/pi-render-core';
import {
	cfg,
	type DiffColors,
	lang as diffLang,
	hlBlock,
	parseDiff,
	renderSplit,
	resolveDiffColors,
	shortPath,
} from '@victor-software-house/pi-render-core/diff';
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
			"Only changed sections plus minimal unique context to anchor each change. Mark everything else '// ... existing code ...' — never repeat unchanged content. Works per-line too: { a: new, b: // ... existing ..., c: other }. One marker skips any region including nested objects.",
	}),
});

export function registerQuickEditTool(pi: ExtensionAPI): void {
	pi.registerTool<typeof QuickEditParams, Partial<QuickEditDetails>>({
		name: 'quick_edit',
		label: 'Quick Edit',
		description:
			"Default file editor; fall back to edit only for simple single-string replacements.\n\nUse this tool to make an edit to an existing file, or create a new file when the path does not exist.\n\nThis will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.\n\nWhen writing the edit, specify each edit in sequence with the special comment // ... existing code ... to represent unchanged code in between. The marker also works inline for dense lines:\n\n// ... existing code ...\nCHANGED_BLOCK\n// ... existing code ...\n\nInline (multiple markers per line, one per field):\n{ host: 'new', port: // ... existing ..., ssl: // ... existing ..., pool: 20 }\n\nYou should bias towards repeating as few lines as possible to convey the change. But each edit should contain minimally sufficient context of unchanged lines to resolve ambiguity.\n\nDO NOT omit spans of pre-existing code (or comments) without using the // ... existing code ... comment to indicate its absence. If you omit it, the model may inadvertently delete those lines.\n\nMake all edits to a file in a single quick_edit call rather than multiple calls to the same file.",
		promptSnippet: 'quick_edit: default editor. Changed sections + markers only. edit for tiny exact replacements.',
		promptGuidelines: [
			"quick_edit: never repeat unchanged lines — every skipped region is a '// ... existing code ...' marker, no exceptions.",
			'quick_edit inline markers: skip unchanged fields on the same line — { a: new, b: // ... existing ..., c: other, d: // ... existing ... } — one marker per field, multiple per line.',
			"quick_edit reorder: write the new order and mark each unchanged field value inline — never retype field values that didn't change.",
			'quick_edit sparse: two block markers bracket the changed entry — everything between is skipped.',
		],
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
				? `${theme.fg('success', `+${changes.linesAdded}`)}/${theme.fg('error', `-${changes.linesRemoved}`)}`
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
				const component = getWidthAwareText(context);
				const ex = context.expanded ? 1 : 0;
				const language = diffLang(details.absolutePath ?? filePath);
				const diff = parseDiff(originalCode, mergedCode);
				const dc: DiffColors = resolveDiffColors(theme);
				const maxLines = context.expanded ? diff.lines.length : cfg.maxDiffLines;
				const wr = context.expanded ? (cfg.maxWrapRows ?? 10) : undefined;

				component.setRenderer((width: number) => {
					const key = `morph:${width}:${diff.added}:${diff.removed}:${diff.lines.length}:${language ?? ''}:${ex}:${theme.name}`;

					if (st._morphDiffKey !== key) {
						st._morphDiffKey = key;
						st._morphDiffText = [header, changeLine, '', theme.fg('muted', '  rendering diff...')]
							.filter(Boolean)
							.join('\n');

						renderSplit(diff, language, maxLines, dc, wr, width)
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

					return st._morphDiffText ?? [header, changeLine].filter(Boolean).join('  ');
				});
				return component;
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
