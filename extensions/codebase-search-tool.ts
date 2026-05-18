import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import {
	LocalRipgrepProvider,
	WarpGrepClient,
	type WarpGrepContext,
	type WarpGrepProvider,
	type WarpGrepResult,
	type WarpGrepStep,
} from '@morphllm/morphsdk';
import { Type } from '@sinclair/typebox';
import { ensureMorphApiKey } from './auth';
import { buildWarpGrepConfig, getMorphRuntimeConfig } from './runtime-config';
import {
	type CodebaseSearchRedactionOptions,
	containsDetectedSecret,
	isCodebaseSearchRedactionEnabled,
	redactGrepLines,
	redactReadLines,
} from './secret-redaction';

const MAX_CONTEXTS = 8;
const MAX_CONTEXT_LINES = 120;
const MAX_TOTAL_CHARS = 24_000;

const CodebaseSearchParams = Type.Object({
	searchTerm: Type.String({
		description: 'Natural-language question about where code behavior lives in the local codebase.',
	}),
	repoRoot: Type.Optional(
		Type.String({ description: 'Local workspace directory to search. Defaults to the current workspace.' }),
	),
	includes: Type.Optional(
		Type.Array(Type.String(), {
			description: 'Optional ripgrep-style glob patterns to include (e.g. ["src/**/*.ts"]).',
		}),
	),
	excludes: Type.Optional(
		Type.Array(Type.String(), {
			description: 'Optional ripgrep-style glob patterns to exclude. Replaces SDK default excludes when set.',
		}),
	),
	searchType: Type.Optional(
		Type.Union([Type.Literal('default'), Type.Literal('node_modules')], {
			description: 'Search scope. Use node_modules to include dependency directories normally excluded by default.',
		}),
	),
});

export interface ResolvedWorkspaceDirectory {
	requestedPath: string;
	absolutePath: string;
}

export interface DisplaySearchContext {
	file: string;
	lineRanges: string;
	content: string;
	lineCount: number;
	truncated: boolean;
}

export interface CodebaseSearchDetails {
	searchTerm: string;
	repoRoot: string;
	success: boolean;
	summary: string | undefined;
	contextCount: number;
	shownContextCount: number;
	truncated: boolean;
	contexts: DisplaySearchContext[];
	lastStep?: WarpGrepStep;
	/** Total wall time for the WarpGrep search in milliseconds. */
	latencyMs?: number;
	/** Number of model turns used. */
	turnsUsed?: number;
}

function expandDirectoryPath(directoryPath: string): string {
	const normalized = directoryPath.startsWith('@') ? directoryPath.slice(1) : directoryPath;
	if (normalized === '~') return homedir();
	if (normalized.startsWith('~/')) return homedir() + normalized.slice(1);
	return normalized;
}

function assertInsideWorkspace(workspaceRoot: string, targetPath: string): void {
	const relativePath = relative(workspaceRoot, targetPath);
	if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) return;

	throw new Error('codebase_search only supports repo roots inside the current workspace.');
}

export interface SafeWarpGrepProviderOptions extends CodebaseSearchRedactionOptions {
	includes?: string[];
	excludes?: string[];
	searchType?: 'default' | 'node_modules';
}

export function createSafeWarpGrepProvider(
	repoRoot: string,
	options: SafeWarpGrepProviderOptions = {},
): WarpGrepProvider {
	const providerOptions: { allowNames?: string[]; includes?: string[] } = {};
	const autoDetectedNodeModules = repoRoot.split('/').includes('node_modules');
	if (options.searchType === 'node_modules' || autoDetectedNodeModules) {
		providerOptions.allowNames = ['node_modules'];
	}
	if (options.includes != null && options.includes.length > 0) providerOptions.includes = options.includes;
	const inner = new LocalRipgrepProvider(
		repoRoot,
		options.excludes,
		Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
	);
	const redactionEnabled = options.enabled ?? true;
	return {
		async grep(params) {
			const result = await inner.grep(params);
			if (!redactionEnabled) return result;
			return { ...result, lines: await redactGrepLines(result.lines, params.path, repoRoot) };
		},
		async read(params) {
			const result = await inner.read(params);
			if (!redactionEnabled) return result;
			return { ...result, lines: await redactReadLines(result.lines, params.path, repoRoot) };
		},
		async listDirectory(params) {
			return inner.listDirectory(params);
		},
		async glob(params) {
			return inner.glob(params);
		},
	};
}

export async function resolveWorkspaceDirectory(
	workspaceCwd: string,
	inputPath: string | undefined,
): Promise<ResolvedWorkspaceDirectory> {
	const trimmedInput = inputPath?.trim();
	const targetPath = expandDirectoryPath(trimmedInput == null || trimmedInput === '' ? '.' : trimmedInput);
	const workspaceRoot = await realpath(workspaceCwd);
	const requestedPath = resolve(workspaceRoot, targetPath);
	const absolutePath = await realpath(requestedPath);
	assertInsideWorkspace(workspaceRoot, absolutePath);

	const info = await stat(absolutePath);
	if (!info.isDirectory()) {
		throw new Error(`codebase_search repoRoot must be a directory: ${inputPath ?? '.'}`);
	}

	return { requestedPath, absolutePath };
}

function formatLineRanges(lines: WarpGrepContext['lines']): string {
	if (lines == null || lines === '*') return '*';
	return lines.map(([start, end]) => `${start}-${end}`).join(',');
}

function truncateContextContent(content: string): { content: string; lineCount: number; truncated: boolean } {
	const lines = content.split('\n');
	const truncated = lines.length > MAX_CONTEXT_LINES;
	const shown = truncated ? lines.slice(0, MAX_CONTEXT_LINES) : lines;
	return {
		content: shown.join('\n'),
		lineCount: lines.length,
		truncated,
	};
}

function displayContextFile(repoRoot: string, filePath: string): string {
	const relativePath = relative(repoRoot, filePath);
	if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) return filePath;
	return relativePath;
}

function displaySummary(repoRoot: string, summary: string | undefined): string | undefined {
	if (summary == null) return undefined;
	return summary.split(`${repoRoot}/`).join('');
}

export function buildSearchDetails(
	searchTerm: string,
	repoRoot: string,
	result: WarpGrepResult,
): CodebaseSearchDetails {
	const sourceContexts = result.contexts ?? [];
	const contexts: DisplaySearchContext[] = [];
	let totalChars = 0;
	let truncated = sourceContexts.length > MAX_CONTEXTS;

	for (const context of sourceContexts.slice(0, MAX_CONTEXTS)) {
		const bounded = truncateContextContent(context.content);
		let content = bounded.content;
		let contextTruncated = bounded.truncated;
		const remainingChars = MAX_TOTAL_CHARS - totalChars;

		if (remainingChars <= 0) {
			truncated = true;
			break;
		}

		if (content.length > remainingChars) {
			content = content.slice(0, remainingChars);
			contextTruncated = true;
			truncated = true;
		}

		totalChars += content.length;
		contexts.push({
			file: displayContextFile(repoRoot, context.file),
			lineRanges: formatLineRanges(context.lines),
			content,
			lineCount: bounded.lineCount,
			truncated: contextTruncated,
		});
	}

	return {
		searchTerm,
		repoRoot,
		success: result.success,
		summary: displaySummary(repoRoot, result.summary),
		contextCount: sourceContexts.length,
		shownContextCount: contexts.length,
		truncated,
		contexts,
	};
}

export function formatSearchContent(details: CodebaseSearchDetails): string {
	if (!details.success) return 'Codebase Search failed.';
	if (details.contexts.length === 0) return `Codebase Search: ${details.searchTerm}\nNo relevant code found.`;

	const lines = [
		`Codebase Search: ${details.searchTerm}`,
		`Found ${details.contextCount} context(s); showing ${details.shownContextCount}.`,
	];

	if (details.summary != null && details.summary.trim() !== '') {
		lines.push('', 'Summary:', details.summary.trim());
	}

	for (const context of details.contexts) {
		const truncatedLabel = context.truncated ? ' truncated="true"' : '';
		lines.push(
			'',
			`<file path="${context.file}" lines="${context.lineRanges}"${truncatedLabel}>`,
			context.content,
			'</file>',
		);
	}

	if (details.truncated) lines.push('', 'Output truncated. Refine searchTerm if more context is needed.');
	return lines.join('\n');
}

function formatStep(step: WarpGrepStep): string {
	const calls = step.toolCalls.map((call) => call.name).join(', ') || 'thinking';
	return `Codebase Search turn ${step.turn}: ${calls}`;
}

export function registerCodebaseSearchTool(pi: ExtensionAPI): void {
	pi.registerTool<typeof CodebaseSearchParams, Partial<CodebaseSearchDetails>>({
		name: 'codebase_search',
		label: 'Codebase Search',
		description:
			'Search the local workspace semantically with Morph WarpGrep. Use for broad questions about where a behavior, abstraction, or flow lives. Pass includes/excludes/searchType to narrow scope. Use grep/find for exact strings or filenames.',
		promptSnippet:
			'Use codebase_search for semantic/exploratory code questions; grep/find for exact strings or filenames. See routing policy in instructions/morph-tools.md.',
		promptGuidelines: ['codebase_search: Use for broad local code exploration, not exact keyword or filename lookup.'],
		parameters: CodebaseSearchParams,

		renderCall(args, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);
			const term = args.searchTerm ?? '';
			const root = args.repoRoot ?? '.';
			const header = `${theme.fg('toolTitle', theme.bold('codebase_search'))} ${theme.fg('accent', term)}`;
			text.setText(root === '.' ? header : `${header}\n${theme.fg('muted', root)}`);
			return text;
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			const text = context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);

			if (isPartial) {
				const first = result.content[0];
				const raw = first != null && first.type === 'text' ? first.text : '';
				text.setText(theme.fg('warning', raw !== '' ? raw : 'Searching codebase...'));
				return text;
			}

			if (context.isError) {
				const first = result.content[0];
				const errorMsg = first != null && first.type === 'text' ? first.text : 'Unknown error';
				text.setText(
					`${theme.fg('error', '✘')} ${theme.fg('toolTitle', theme.bold('codebase_search'))} failed\n${theme.fg('error', errorMsg)}`,
				);
				return text;
			}

			const details = result.details;
			const ctxLabel = `${details.shownContextCount ?? 0}/${details.contextCount ?? 0} contexts`;
			const latencyLabel = details.latencyMs != null ? `(${details.latencyMs}ms)` : null;
			const turnsLabel = details.turnsUsed != null && details.turnsUsed > 0 ? `${details.turnsUsed} turns` : null;
			const collapsedSuffix = [turnsLabel, latencyLabel].filter(Boolean).join(', ');
			const header =
				theme.fg('success', '✔') +
				' ' +
				theme.fg('toolTitle', theme.bold('codebase_search')) +
				': ' +
				theme.fg('accent', ctxLabel) +
				(collapsedSuffix ? ` ${theme.fg('dim', collapsedSuffix)}` : '');

			if (!expanded) {
				text.setText(header);
				return text;
			}

			const first = result.content[0];
			const raw = first != null && first.type === 'text' ? first.text : header;
			text.setText(`${header}\n\n${raw}`);
			return text;
		},

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const apiKey = await ensureMorphApiKey(ctx.modelRegistry.authStorage);
			const runtimeConfig = await getMorphRuntimeConfig();
			const { absolutePath } = await resolveWorkspaceDirectory(ctx.cwd, params.repoRoot);

			const redactionEnabled = isCodebaseSearchRedactionEnabled();
			if (await containsDetectedSecret(params.searchTerm)) {
				throw new Error('codebase_search searchTerm appears to contain a secret; use local grep/find instead.');
			}

			onUpdate?.({
				content: [{ type: 'text', text: `Starting Codebase Search for ${params.searchTerm}...` }],
				details: {},
			});

			const client = new WarpGrepClient(buildWarpGrepConfig(apiKey, runtimeConfig));
			const providerOptions: SafeWarpGrepProviderOptions = { enabled: redactionEnabled };
			if (params.includes && params.includes.length > 0) providerOptions.includes = params.includes;
			if (params.excludes && params.excludes.length > 0) providerOptions.excludes = params.excludes;
			if (params.searchType != null) providerOptions.searchType = params.searchType;
			const stream = client.execute({
				searchTerm: params.searchTerm,
				repoRoot: absolutePath,
				provider: createSafeWarpGrepProvider(absolutePath, providerOptions),
				streamSteps: true,
				...(params.includes && params.includes.length > 0 ? { includes: params.includes } : {}),
				...(params.excludes && params.excludes.length > 0 ? { excludes: params.excludes } : {}),
				...(params.searchType != null ? { search_type: params.searchType } : {}),
			});

			const searchStart = Date.now();
			let result: WarpGrepResult | undefined;
			let turnsUsed = 0;
			for (;;) {
				if (signal?.aborted === true) throw new Error('codebase_search aborted.');
				const next = await stream.next();
				if (next.done === true) {
					result = next.value;
					break;
				}
				turnsUsed = next.value.turn;
				onUpdate?.({ content: [{ type: 'text', text: formatStep(next.value) }], details: { lastStep: next.value } });
			}
			const latencyMs = Date.now() - searchStart;

			if (result == null) throw new Error('Codebase Search did not return a result.');
			if (!result.success) throw new Error(`Codebase Search failed: ${result.error ?? 'unknown error'}`);

			const details = buildSearchDetails(params.searchTerm, absolutePath, result);
			return {
				content: [{ type: 'text', text: formatSearchContent(details) }],
				details: { ...details, latencyMs, turnsUsed },
			};
		},
	});
}
