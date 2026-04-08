import { resolve } from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import type { WarpGrepResult, WarpGrepStep } from '@morphllm/morphsdk/tools/warp-grep';
import { WarpGrepClient } from '@morphllm/morphsdk/tools/warp-grep';
import { Type } from '@sinclair/typebox';
import { ensureMorphApiKey, getMorphApiBaseUrl } from './auth';

const DEFAULT_TIMEOUT_MS = 30_000;

const CodebaseSearchParams = Type.Object({
	searchTerm: Type.String({
		description:
			'Natural language description of what to find. Example: "Find where user authentication tokens are validated"',
	}),
	repoRoot: Type.Optional(
		Type.String({
			description: 'Root directory to search (defaults to current working directory)',
		}),
	),
});

interface CodebaseSearchDetails {
	searchTerm: string;
	repoRoot: string;
	fileCount: number;
	turns: number;
	success: boolean;
	error?: string | undefined;
}

/**
 * Format a single step for TUI progress display.
 */
function formatStep(step: WarpGrepStep): string {
	const tools = step.toolCalls.map((tc) => tc.name).join(', ');
	return `Turn ${step.turn}: ${tools}`;
}

/**
 * Build the model-facing text result from WarpGrep contexts.
 */
function buildResultText(result: WarpGrepResult): string {
	if (!result.success) {
		return result.error ?? 'Search failed with no error message.';
	}

	const contexts = result.contexts;
	if (contexts == null || contexts.length === 0) {
		return 'No relevant code found for this search.';
	}

	const sections: string[] = [];
	for (const ctx of contexts) {
		sections.push(`--- ${ctx.file} ---\n${ctx.content}`);
	}
	return sections.join('\n\n');
}

export function registerWarpGrep(pi: ExtensionAPI): void {
	pi.registerTool<typeof CodebaseSearchParams, Partial<CodebaseSearchDetails>>({
		name: 'codebase_search',
		label: 'Codebase Search',
		description:
			'Search the codebase using a natural language query. Runs an AI-powered search subagent that finds relevant code without polluting the main conversation context. Use for broad semantic queries like "Find the authentication flow" or "Where are database migrations handled". Do NOT pass regex patterns — describe what you are looking for in plain English.',
		promptSnippet:
			'Use codebase_search for broad semantic code exploration at the start of a task. Use grep for exact keyword or regex matches.',
		promptGuidelines: [
			'codebase_search is an intelligent search subagent, not regex search. Describe what you are looking for in plain English.',
			'Use codebase_search at the start of codebase explorations for broad semantic queries like "Find the authentication flow" or "How does payment processing work".',
			'Use native grep instead for exact keyword searches, known symbol names, or regex patterns.',
			'Each search runs in an isolated context window (~6 seconds) — the main conversation stays clean.',
		],
		parameters: CodebaseSearchParams,

		renderCall(args, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);
			const searchTerm = args.searchTerm ?? '';
			const repoRoot = args.repoRoot ?? '';

			const hdr =
				`${theme.fg('toolTitle', theme.bold('codebase_search'))}` +
				(repoRoot ? ` ${theme.fg('accent', repoRoot)}` : '') +
				(searchTerm ? `\n${theme.fg('muted', searchTerm)}` : '');

			text.setText(hdr);
			return text;
		},

		renderResult(result, { expanded }, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);

			if (context.isError) {
				const first = result.content[0];
				const errorMsg = first != null && first.type === 'text' ? first.text : 'Unknown error';
				const header =
					theme.fg('error', '\u2718') +
					' ' +
					theme.fg('toolTitle', theme.bold('codebase_search')) +
					' ' +
					theme.fg('error', 'failed');
				text.setText([header, theme.fg('error', errorMsg)].join('\n'));
				return text;
			}

			const details = result.details;
			const fileCount = details.fileCount ?? 0;
			const turns = details.turns ?? 0;
			const success = details.success ?? false;

			if (!success) {
				const header =
					theme.fg('warning', '?') +
					' ' +
					theme.fg('toolTitle', theme.bold('codebase_search')) +
					' ' +
					theme.fg('warning', 'no results');
				text.setText(header);
				return text;
			}

			const header =
				theme.fg('success', '\u2714') +
				' ' +
				theme.fg('toolTitle', theme.bold('codebase_search')) +
				' ' +
				theme.fg('dim', `${fileCount} file${fileCount !== 1 ? 's' : ''} found`) +
				' ' +
				theme.fg('muted', `(${turns} turn${turns !== 1 ? 's' : ''})`);

			if (!expanded) {
				const searchTerm = details.searchTerm ?? '';
				text.setText([header, searchTerm ? theme.fg('muted', searchTerm) : ''].filter(Boolean).join('\n'));
				return text;
			}

			// Expanded: show full result text
			const first = result.content[0];
			const fullText = first != null && first.type === 'text' ? first.text : '';
			const maxLines = 60;
			const lines = fullText.split('\n');
			const preview = lines.slice(0, maxLines).join('\n');
			const rem = lines.length - maxLines;
			let out = `${header}\n\n${preview}`;
			if (rem > 0) out += `\n${theme.fg('muted', `\u2026 ${rem} more lines`)}`;
			text.setText(out);
			return text;
		},

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const apiKey = await ensureMorphApiKey(ctx.modelRegistry.authStorage);
			const repoRoot = resolve(ctx.cwd, params.repoRoot ?? '.');

			onUpdate?.({
				content: [{ type: 'text', text: `Searching: ${params.searchTerm}` }],
				details: { searchTerm: params.searchTerm, repoRoot },
			});

			const client = new WarpGrepClient({
				morphApiKey: apiKey,
				morphApiUrl: getMorphApiBaseUrl(),
				timeout: DEFAULT_TIMEOUT_MS,
			});

			let turnCount = 0;
			let result: WarpGrepResult;

			try {
				const stream = client.execute({
					searchTerm: params.searchTerm,
					repoRoot,
					streamSteps: true,
				});

				// Consume the async generator — steps are yielded, final result is the return value
				let iterResult = await stream.next();
				while (iterResult.done !== true) {
					const step = iterResult.value;
					turnCount = step.turn;
					onUpdate?.({
						content: [{ type: 'text', text: formatStep(step) }],
						details: { searchTerm: params.searchTerm, repoRoot, turns: turnCount },
					});
					iterResult = await stream.next();
				}

				result = iterResult.value;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new Error(`Codebase search failed: ${message}`);
			}

			const fileCount = result.contexts?.length ?? 0;
			const resultText = buildResultText(result);

			return {
				content: [{ type: 'text', text: resultText }],
				details: {
					searchTerm: params.searchTerm,
					repoRoot,
					fileCount,
					turns: turnCount,
					success: result.success,
					error: result.error,
				},
			};
		},
	});
}
