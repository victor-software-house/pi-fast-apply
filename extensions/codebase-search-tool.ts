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
import {
	BOLD,
	FG_DIM,
	FG_RULE,
	fileIcon,
	hlBlock,
	lang,
	lnum,
	RST,
	rule,
	strip,
	termW,
} from '@victor-software-house/pi-render-core';
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

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/** Parse the start line from a "N-M" or "N" range string. */
function parseStartLine(lineRanges: string): number {
	const first = lineRanges.split(',')[0]?.trim() ?? '';
	const n = parseInt(first.split('-')[0] ?? '1', 10);
	return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Render one context block: file header + rule + syntax-highlighted lines with gutter. */
async function renderContextBlock(ctx: DisplaySearchContext, expanded: boolean): Promise<string> {
	const tw = termW();
	const startLine = parseStartLine(ctx.lineRanges);
	const code = ctx.content;
	const lines = code.split('\n');
	const lg = lang(ctx.file);
	const highlighted = await hlBlock(code, lg);

	const endLine = startLine + lines.length - 1;
	const nw = Math.max(3, String(endLine).length);
	const gw = nw + 3; // num + " │ "
	const cw = Math.max(20, tw - gw);

	const icon = fileIcon(ctx.file);
	const truncNote = ctx.truncated ? ` ${FG_DIM}(truncated)${RST}` : '';
	const header = `${icon} ${BOLD}${ctx.file}${RST}  ${FG_DIM}lines ${ctx.lineRanges}${RST}${truncNote}`;

	const out: string[] = [header, rule(tw)];

	for (let i = 0; i < highlighted.length; i++) {
		const ln = startLine + i;
		const hlLine = highlighted[i] ?? lines[i] ?? '';
		const plain = strip(hlLine);

		let display = hlLine;
		if (!expanded && plain.length > cw) {
			// Truncate to terminal width without breaking ANSI
			let vis = 0;
			let j = 0;
			while (j < hlLine.length && vis < cw - 1) {
				if (hlLine[j] === '\x1b') {
					const e = hlLine.indexOf('m', j);
					if (e !== -1) {
						j = e + 1;
						continue;
					}
				}
				vis++;
				j++;
			}
			display = `${hlLine.slice(0, j)}${RST}${FG_DIM}›${RST}`;
		}
		out.push(`${lnum(ln, nw)} ${FG_RULE}│${RST} ${display}${RST}`);
	}

	out.push(rule(tw));
	return out.join('\n');
}

/** Async render all context blocks for the expanded result. */
async function renderExpandedBody(details: CodebaseSearchDetails): Promise<string> {
	const blocks = await Promise.all(details.contexts.map((ctx) => renderContextBlock(ctx, true)));
	const parts: string[] = [];

	if (details.summary != null && details.summary.trim() !== '') {
		parts.push(`${FG_DIM}${details.summary.trim()}${RST}`);
	}

	if (details.truncated) {
		parts.push(`${FG_DIM}Output truncated. Refine searchTerm if more context is needed.${RST}`);
	}

	parts.push(...blocks);
	return parts.join('\n\n');
}

/** Model-facing content string — the LLM-visible result (plain XML-like blocks). */
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

	for (const ctx of details.contexts) {
		const truncatedLabel = ctx.truncated ? ' truncated="true"' : '';
		lines.push('', `<file path="${ctx.file}" lines="${ctx.lineRanges}"${truncatedLabel}>`, ctx.content, '</file>');
	}

	if (details.truncated) lines.push('', 'Output truncated. Refine searchTerm if more context is needed.');
	return lines.join('\n');
}

/** Collapsed file list — no code, just dim path + line range bullets. */
function renderFileList(details: CodebaseSearchDetails): string {
	return details.contexts.map((ctx) => `  ${FG_DIM}${ctx.file}:${ctx.lineRanges}${RST}`).join('\n');
}

function formatStep(step: WarpGrepStep): string {
	const calls = step.toolCalls.map((call) => call.name).join(', ') || 'thinking';
	return `Codebase Search turn ${step.turn}: ${calls}`;
}

export function registerCodebaseSearchTool(pi: ExtensionAPI): void {
	interface SearchRenderState {
		key?: string;
		body?: string | null;
	}

	pi.registerTool<typeof CodebaseSearchParams, Partial<CodebaseSearchDetails>, SearchRenderState>({
		name: 'codebase_search',
		label: 'Codebase Search',
		description:
			'Search the local workspace semantically with Morph WarpGrep. Use for broad questions: where a flow is implemented, how a module works, where a behavior lives. Not for exact keyword or symbol lookup — use grep/find for those.',
		promptSnippet: 'codebase_search: semantic/exploratory code questions. grep/find for exact strings or filenames.',
		promptGuidelines: [
			'codebase_search: use for broad questions about where behavior lives, not for exact strings or filenames — grep/find are faster and use no API budget.',
		],
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

			// Partial / still searching
			if (isPartial) {
				const first = result.content[0];
				const raw = first?.type === 'text' ? first.text : '';
				text.setText(theme.fg('warning', raw !== '' ? raw : 'Searching codebase...'));
				return text;
			}

			// Error
			if (context.isError) {
				const first = result.content[0];
				const errorMsg = first?.type === 'text' ? first.text : 'Unknown error';
				text.setText(
					`${theme.fg('error', '✘')} ${theme.fg('toolTitle', theme.bold('codebase_search'))} failed\n${theme.fg('error', errorMsg)}`,
				);
				return text;
			}

			const details = result.details;
			const ctxLabel = `${details.shownContextCount ?? 0}/${details.contextCount ?? 0} contexts`;
			const latencyLabel = details.latencyMs != null ? `(${details.latencyMs}ms)` : null;
			const turnsLabel = details.turnsUsed != null && details.turnsUsed > 0 ? `${details.turnsUsed} turns` : null;
			const meta = [turnsLabel, latencyLabel].filter(Boolean).join(' · ');
			const header =
				`${theme.fg('success', '✔')} ` +
				`${theme.fg('toolTitle', theme.bold('codebase_search'))}: ` +
				`${theme.fg('accent', ctxLabel)}` +
				(meta ? `  ${theme.fg('dim', meta)}` : '');

			// Full details required for rich rendering — fall back to plain header if not yet available.
			function isFullDetails(d: Partial<CodebaseSearchDetails>): d is CodebaseSearchDetails {
				return d.searchTerm != null && d.contexts != null;
			}
			const fullDetails = isFullDetails(details) ? details : null;

			// Collapsed: header + dim file:line list
			if (!expanded) {
				const fileList = fullDetails != null ? renderFileList(fullDetails) : '';
				text.setText(fileList ? `${header}\n${fileList}` : header);
				return text;
			}

			// Expanded: async syntax-highlighted blocks
			const key = `search:${details.searchTerm}:${details.contextCount}:${details.shownContextCount}`;
			if (context.state.key !== key) {
				context.state.key = key;
				context.state.body = null;

				if (fullDetails != null) {
					renderExpandedBody(fullDetails)
						.then((body) => {
							if (context.state.key !== key) return;
							context.state.body = body;
							context.invalidate();
						})
						.catch(() => {
							if (context.state.key !== key) return;
							const first = result.content[0];
							context.state.body = first?.type === 'text' ? first.text : '';
							context.invalidate();
						});
				}
			}

			const fallback = fullDetails != null ? renderFileList(fullDetails) : '';
			const body: string = context.state.body ?? fallback;
			text.setText(`${header}\n\n${body}`);
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
