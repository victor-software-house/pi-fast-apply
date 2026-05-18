import { readFile, writeFile } from 'node:fs/promises';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { withFileMutationQueue } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from '@sinclair/typebox';
import { shortPath } from 'pi-diff/render';
import { resolveWorkspaceFilePath } from './morph-apply';

const QuickEditParams = Type.Object({
	path: Type.String({ description: 'Path to the workspace file to edit (relative or absolute).' }),
	edits: Type.Array(
		Type.Object({
			oldText: Type.String({ description: 'Exact text to find. Must appear exactly once in the file.' }),
			newText: Type.String({ description: 'Replacement text.' }),
		}),
		{
			description:
				'One or more non-overlapping replacements applied in order. Each oldText must be unique in the file.',
		},
	),
});

interface QuickEditDetails {
	path: string;
	editCount: number;
	appliedCount: number;
}

export function registerQuickEditTool(pi: ExtensionAPI): void {
	pi.registerTool<typeof QuickEditParams, Partial<QuickEditDetails>>({
		name: 'quick_edit',
		label: 'Quick Edit',
		description:
			'Exact string replacement in a workspace file. Use for small, precise changes where oldText is unique in the file. For scattered changes, large files (300+ lines), or fragile matching use fast_apply instead.',
		promptSnippet: 'quick_edit: small exact text replacements in a workspace file.',
		promptGuidelines: [
			'quick_edit oldText must match exactly once in the file. Use fast_apply when multiple disjoint changes are needed or exact matching is fragile.',
		],
		parameters: QuickEditParams,

		renderCall(args, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);
			const home = process.env['HOME'] ?? '';
			const filePath = args.path ?? '';
			const editCount = args.edits?.length ?? 0;
			text.setText(
				`${theme.fg('toolTitle', theme.bold('quick_edit'))} ${theme.fg('accent', shortPath(context.cwd, home, filePath))}` +
					(editCount > 0 ? ` ${theme.fg('dim', `${editCount} edit${editCount !== 1 ? 's' : ''}`)}` : ''),
			);
			return text;
		},

		renderResult(result, { isPartial }, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);

			if (isPartial) {
				text.setText(theme.fg('warning', 'Applying edits...'));
				return text;
			}

			if (context.isError) {
				const first = result.content[0];
				const errorMsg = first != null && first.type === 'text' ? first.text : 'Unknown error';
				text.setText(
					`${theme.fg('error', '✘')} ${theme.fg('toolTitle', theme.bold('quick_edit'))} failed\n${theme.fg('error', errorMsg)}`,
				);
				return text;
			}

			const details = result.details;
			const label =
				(details.appliedCount ?? 0) > 0
					? `✔ ${details.appliedCount}/${details.editCount} edit${(details.editCount ?? 0) !== 1 ? 's' : ''} applied`
					: '✔ applied';
			text.setText(
				`${theme.fg('success', '✔')} ${theme.fg('toolTitle', theme.bold('quick_edit'))}: ${theme.fg('accent', details.path ?? '')} ${theme.fg('dim', label)}`,
			);
			return text;
		},

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const { absolutePath } = await resolveWorkspaceFilePath(ctx.cwd, params.path);

			return withFileMutationQueue(absolutePath, async () => {
				let content = await readFile(absolutePath, 'utf8');
				let appliedCount = 0;

				for (const edit of params.edits) {
					const occurrences = content.split(edit.oldText).length - 1;
					if (occurrences === 0) {
						throw new Error(`quick_edit: oldText not found in ${params.path}:\n${edit.oldText.slice(0, 300)}`);
					}
					if (occurrences > 1) {
						throw new Error(
							`quick_edit: oldText matches ${occurrences} times in ${params.path} (must be unique). Use a more specific oldText or use fast_apply.\n${edit.oldText.slice(0, 300)}`,
						);
					}
					content = content.replace(edit.oldText, edit.newText);
					appliedCount += 1;
				}

				await writeFile(absolutePath, content, 'utf8');

				return {
					content: [
						{
							type: 'text',
							text: `Edited ${params.path}: ${appliedCount} replacement${appliedCount !== 1 ? 's' : ''} applied.`,
						},
					],
					details: {
						path: params.path,
						editCount: params.edits.length,
						appliedCount,
					} satisfies QuickEditDetails,
				};
			});
		},
	});
}
