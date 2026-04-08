import { resolve } from 'node:path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { getLanguageFromPath, highlightCode } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import type { WarpGrepContext, WarpGrepResult } from '@morphllm/morphsdk/tools/warp-grep';
import { WarpGrepClient } from '@morphllm/morphsdk/tools/warp-grep';
import { Type } from '@sinclair/typebox';
import { shortPath } from 'pi-diff/render';
import { ensureMorphApiKey, getMorphApiBaseUrl } from './auth';

const DEFAULT_TIMEOUT_MS = 30_000;
const COLLAPSED_MAX_LINES = 15;

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

interface FileContext {
	file: string;
	content: string;
	lineCount: number;
}

interface StepInfo {
	turn: number;
	tools: string[];
}

interface CodebaseSearchDetails {
	searchTerm: string;
	repoRoot: string;
	fileCount: number;
	turns: number;
	success: boolean;
	error?: string | undefined;
	contexts: FileContext[];
	steps: StepInfo[];
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

/**
 * Map SDK contexts to serializable details.
 */
function mapContexts(contexts: WarpGrepContext[] | undefined): FileContext[] {
	if (contexts == null || contexts.length === 0) return [];
	return contexts.map((ctx) => ({
		file: ctx.file,
		content: ctx.content,
		lineCount: ctx.content.split('\n').length,
	}));
}

/**
 * Syntax-highlight a file's content lines, falling back to toolOutput color.
 */
function highlightFileContent(
	content: string,
	filePath: string,
	theme: Parameters<NonNullable<Parameters<ExtensionAPI['registerTool']>[0]['renderResult']>>[2],
): string[] {
	const lang = getLanguageFromPath(filePath);
	if (lang != null) {
		return highlightCode(content, lang);
	}
	return content.split('\n').map((line) => theme.fg('toolOutput', line));
}

/**
 * Render file sections with syntax highlighting.
 * When maxLines is set, truncates and returns remaining count.
 */
function renderFileBlocks(
	contexts: FileContext[],
	repoRoot: string,
	home: string,
	theme: Parameters<NonNullable<Parameters<ExtensionAPI['registerTool']>[0]['renderResult']>>[2],
	maxLines?: number,
): { lines: string[]; remaining: number } {
	const out: string[] = [];
	let totalShown = 0;
	let totalRemaining = 0;

	for (const ctx of contexts) {
		const filePath = shortPath(repoRoot, home, ctx.file);
		out.push(theme.fg('accent', `--- ${filePath} ---`));

		const highlighted = highlightFileContent(ctx.content, ctx.file, theme);

		if (maxLines != null) {
			const budget = maxLines - totalShown;
			if (budget <= 0) {
				out.push(theme.fg('muted', `  \u2026 ${ctx.lineCount} lines`));
				totalRemaining += ctx.lineCount;
				continue;
			}
			const show = highlighted.slice(0, budget);
			out.push(...show);
			totalShown += show.length;
			const rem = highlighted.length - show.length;
			if (rem > 0) {
				out.push(theme.fg('muted', `  \u2026 ${rem} more lines`));
				totalRemaining += rem;
			}
		} else {
			out.push(...highlighted);
			totalShown += highlighted.length;
		}
		out.push('');
	}

	return { lines: out, remaining: totalRemaining };
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
			const home = process.env['HOME'] ?? '';

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
			const contexts = details.contexts ?? [];
			const steps = details.steps ?? [];
			const repoRoot = details.repoRoot ?? '';

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

			// Header
			const header =
				theme.fg('success', '\u2714') +
				' ' +
				theme.fg('toolTitle', theme.bold('codebase_search')) +
				' ' +
				theme.fg('dim', `${fileCount} file${fileCount !== 1 ? 's' : ''} found`) +
				' ' +
				theme.fg('muted', `(${turns} turn${turns !== 1 ? 's' : ''})`);

			// Steps
			const stepsText =
				steps.length > 0
					? theme.fg('muted', steps.map((s) => `${s.turn}: ${s.tools.join(', ')}`).join(' \u2502 '))
					: '';

			const out: string[] = [header];
			if (stepsText !== '') out.push(stepsText);

			if (contexts.length > 0) {
				out.push('');
				const { lines, remaining } = renderFileBlocks(
					contexts,
					repoRoot,
					home,
					theme,
					expanded ? undefined : COLLAPSED_MAX_LINES,
				);
				out.push(...lines);
				if (!expanded && remaining > 0) {
					out.push(theme.fg('muted', `\u2026 (${remaining} more lines, press e to expand)`));
				}
			}

			text.setText(out.join('\n'));
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
			const steps: StepInfo[] = [];
			let result: WarpGrepResult;

			try {
				const stream = client.execute({
					searchTerm: params.searchTerm,
					repoRoot,
					streamSteps: true,
				});

				let iterResult = await stream.next();
				while (iterResult.done !== true) {
					const step = iterResult.value;
					turnCount = step.turn;
					steps.push({
						turn: step.turn,
						tools: step.toolCalls.map((tc) => tc.name),
					});
					const tools = step.toolCalls.map((tc) => tc.name).join(', ');
					onUpdate?.({
						content: [{ type: 'text', text: `Turn ${step.turn}: ${tools}` }],
						details: { searchTerm: params.searchTerm, repoRoot, turns: turnCount, steps },
					});
					iterResult = await stream.next();
				}

				result = iterResult.value;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				throw new Error(`Codebase search failed: ${message}`);
			}

			const contexts = mapContexts(result.contexts);
			const fileCount = contexts.length;
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
					contexts,
					steps,
				},
			};
		},
	});
}
