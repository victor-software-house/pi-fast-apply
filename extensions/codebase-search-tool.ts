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
import { type RemoteCommands, RemoteCommandsProvider } from '@morphllm/morphsdk/tools/warp-grep';
import { type TObject, Type } from '@sinclair/typebox';
import {
	BOLD,
	FG_DIM,
	FG_RULE,
	fileIcon,
	getWidthAwareText,
	hlBlock,
	lang,
	lnum,
	RST,
	rule,
	strip,
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
	/** Structured line ranges from WarpGrep. */
	ranges?: [number, number][];
	/**
	 * Per-range source lines as read from disk by the SDK — clean, no markers.
	 * Populated by the SDK patch. Use directly for rendering.
	 */
	sourceBlocks?: Array<{ startLine: number; endLine: number; lines: string[] }>;
	content: string;
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

export interface CodebaseSearchExecutionContext {
	cwd: string;
	modelRegistry: { authStorage: Parameters<typeof ensureMorphApiKey>[0] };
	params: unknown;
}

export interface RegisterCodebaseSearchToolOptions {
	name?: string;
	label?: string;
	description?: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	extendParameters?: TObject;
	resolveApiKey?: (ctx: CodebaseSearchExecutionContext) => Promise<string>;
	resolveRuntimeConfig?: () => Promise<Awaited<ReturnType<typeof getMorphRuntimeConfig>>>;
	resolveRepoRoot?: (
		ctx: CodebaseSearchExecutionContext,
		repoRoot: string | undefined,
	) => Promise<ResolvedWorkspaceDirectory>;
	createProvider?: (
		repoRoot: string,
		options: SafeWarpGrepProviderOptions,
		ctx: CodebaseSearchExecutionContext,
	) => WarpGrepProvider;
}

export interface CodebaseSearchInput {
	searchTerm: string;
	repoRoot?: string;
	includes?: string[];
	excludes?: string[];
	searchType?: 'default' | 'node_modules';
}

export interface ExecuteCodebaseSearchContext {
	cwd: string;
	modelRegistry: { authStorage: Parameters<typeof ensureMorphApiKey>[0] };
	params: unknown;
}

export interface ExecuteCodebaseSearchOptions {
	input: CodebaseSearchInput;
	ctx: ExecuteCodebaseSearchContext;
	signal?: AbortSignal;
	onUpdate?:
		| ((chunk: { content: { type: 'text'; text: string }[]; details: Partial<CodebaseSearchDetails> }) => void)
		| undefined;
	resolveApiKey?: (ctx: CodebaseSearchExecutionContext) => Promise<string>;
	resolveRuntimeConfig?: () => Promise<Awaited<ReturnType<typeof getMorphRuntimeConfig>>>;
	resolveRepoRoot?: (
		ctx: CodebaseSearchExecutionContext,
		repoRoot: string | undefined,
	) => Promise<ResolvedWorkspaceDirectory>;
	createProvider?: (
		repoRoot: string,
		options: SafeWarpGrepProviderOptions,
		ctx: CodebaseSearchExecutionContext,
	) => WarpGrepProvider;
}

export interface ExecuteCodebaseSearchResult {
	content: { type: 'text'; text: string }[];
	details: CodebaseSearchDetails;
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

export interface SafeRemoteWarpGrepProviderOptions extends CodebaseSearchRedactionOptions {}

/**
 * Wrap Morph SDK RemoteCommandsProvider with the same redaction layer used
 * for local search. Consumers (for example pi-ssh-tools) supply
 * grep/read/listDir functions that return raw stdout from a remote host; the
 * Morph SDK handles all parsing.
 */
export function createSafeRemoteWarpGrepProvider(
	repoRoot: string,
	commands: RemoteCommands,
	options: SafeRemoteWarpGrepProviderOptions = {},
): WarpGrepProvider {
	const inner = new RemoteCommandsProvider(repoRoot, commands);
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
		const remainingChars = MAX_TOTAL_CHARS - totalChars;

		if (remainingChars <= 0) {
			truncated = true;
			break;
		}

		let content = context.content;
		let contextTruncated = false;

		if (content.length > remainingChars) {
			content = content.slice(0, remainingChars);
			contextTruncated = true;
			truncated = true;
		}

		totalChars += content.length;
		const structuredRanges = context.lines !== '*' && context.lines != null ? context.lines : undefined;
		contexts.push({
			file: displayContextFile(repoRoot, context.file),
			lineRanges: formatLineRanges(context.lines),
			...(structuredRanges != null ? { ranges: structuredRanges } : {}),
			...(context.sourceBlocks != null ? { sourceBlocks: context.sourceBlocks } : {}),
			content,
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

export async function executeCodebaseSearch(
	options: ExecuteCodebaseSearchOptions,
): Promise<ExecuteCodebaseSearchResult> {
	const resolveApiKey =
		options.resolveApiKey ??
		((ctx: CodebaseSearchExecutionContext) => ensureMorphApiKey(ctx.modelRegistry.authStorage));
	const resolveRuntimeConfig = options.resolveRuntimeConfig ?? getMorphRuntimeConfig;
	const resolveRepoRoot =
		options.resolveRepoRoot ??
		((ctx: CodebaseSearchExecutionContext, repoRoot: string | undefined) =>
			resolveWorkspaceDirectory(ctx.cwd, repoRoot));
	const createProvider =
		options.createProvider ??
		((repoRoot: string, providerOptions: SafeWarpGrepProviderOptions) =>
			createSafeWarpGrepProvider(repoRoot, providerOptions));
	const { input, ctx, signal, onUpdate } = options;
	const executionContext: CodebaseSearchExecutionContext = {
		cwd: ctx.cwd,
		modelRegistry: ctx.modelRegistry,
		params: ctx.params,
	};
	const apiKey = await resolveApiKey(executionContext);
	const runtimeConfig = await resolveRuntimeConfig();
	const { absolutePath } = await resolveRepoRoot(executionContext, input.repoRoot);

	const redactionEnabled = isCodebaseSearchRedactionEnabled();
	if (await containsDetectedSecret(input.searchTerm)) {
		throw new Error('codebase_search searchTerm appears to contain a secret; use local grep/find instead.');
	}

	onUpdate?.({
		content: [{ type: 'text', text: `Starting Codebase Search for ${input.searchTerm}...` }],
		details: {},
	});

	const client = new WarpGrepClient(buildWarpGrepConfig(apiKey, runtimeConfig));
	const providerOptions: SafeWarpGrepProviderOptions = { enabled: redactionEnabled };
	if (input.includes && input.includes.length > 0) providerOptions.includes = input.includes;
	if (input.excludes && input.excludes.length > 0) providerOptions.excludes = input.excludes;
	if (input.searchType != null) providerOptions.searchType = input.searchType;
	const stream = client.execute({
		searchTerm: input.searchTerm,
		repoRoot: absolutePath,
		provider: createProvider(absolutePath, providerOptions, executionContext),
		streamSteps: true,
		...(input.includes && input.includes.length > 0 ? { includes: input.includes } : {}),
		...(input.excludes && input.excludes.length > 0 ? { excludes: input.excludes } : {}),
		...(input.searchType != null ? { search_type: input.searchType } : {}),
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

	const details = buildSearchDetails(input.searchTerm, absolutePath, result);
	const modelContent = result.formattedContent ?? formatSearchContent(details);
	return {
		content: [{ type: 'text', text: modelContent }],
		details: { ...details, latencyMs, turnsUsed },
	};
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

// WarpGrep injects "// ... existing code, block starting at line N ..." markers
// between non-contiguous ranges. This regex matches them.
const WARPGREP_BLOCK_MARKER = /^\/\/ \.\.\. existing code, block starting at line (\d+) \.\.\.$/;

interface CodeSubBlock {
	startLine: number;
	lines: string[];
}

/**
 * Split WarpGrep content into sub-blocks using structured ranges when available,
 * falling back to marker parsing. Each sub-block has its correct start line.
 */
function splitIntoSubBlocks(content: string, lineRanges: string, ranges?: [number, number][]): CodeSubBlock[] {
	const rawLines = content.split('\n');

	// Preferred path: use structured ranges from WarpGrepContext.lines
	if (ranges != null && ranges.length > 0) {
		const blocks: CodeSubBlock[] = [];
		let contentIdx = 0;

		for (const [start, end] of ranges) {
			const rangeLen = end - start + 1;
			// Skip any WarpGrep marker lines that precede this block
			while (contentIdx < rawLines.length && WARPGREP_BLOCK_MARKER.test(rawLines[contentIdx] ?? '')) {
				contentIdx++;
			}
			const block = rawLines.slice(contentIdx, contentIdx + rangeLen);
			if (block.length > 0) blocks.push({ startLine: start, lines: block });
			contentIdx += rangeLen;
		}

		if (blocks.length > 0) return blocks;
	}

	// Fallback: parse marker lines in content
	const blocks: CodeSubBlock[] = [];
	let currentStart: number | null = null;
	let currentLines: string[] = [];

	const firstRange = lineRanges.split(',')[0]?.trim() ?? '1';
	const parsed = parseInt(firstRange.split('-')[0] ?? '1', 10);
	const fallbackStart = Number.isFinite(parsed) ? parsed : 1;

	for (const line of rawLines) {
		const m = WARPGREP_BLOCK_MARKER.exec(line);
		if (m != null) {
			if (currentStart != null && currentLines.length > 0) {
				blocks.push({ startLine: currentStart, lines: currentLines });
			}
			currentStart = parseInt(m[1] ?? '1', 10);
			currentLines = [];
		} else {
			if (currentStart == null) currentStart = fallbackStart;
			currentLines.push(line);
		}
	}
	if (currentStart != null && currentLines.length > 0) {
		blocks.push({ startLine: currentStart, lines: currentLines });
	}

	return blocks.length > 0 ? blocks : [{ startLine: fallbackStart, lines: rawLines }];
}

/** Render highlighted lines for one sub-block with correct line numbers. */
function renderSubBlock(
	hlLines: string[],
	srcLines: string[],
	startLine: number,
	nw: number,
	cw: number,
	expanded: boolean,
): string[] {
	const out: string[] = [];
	for (let i = 0; i < hlLines.length; i++) {
		const ln = startLine + i;
		const hlLine = hlLines[i] ?? srcLines[i] ?? '';
		const plain = strip(hlLine);
		let display = hlLine;
		if (!expanded && plain.length > cw) {
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
	return out;
}

/** Total line count for a context — from sourceBlocks, ranges, or content fallback. */
function contextLineCount(ctx: DisplaySearchContext): number {
	if (ctx.sourceBlocks != null && ctx.sourceBlocks.length > 0) {
		return ctx.sourceBlocks.reduce((sum, b) => sum + b.lines.length, 0);
	}
	if (ctx.ranges != null && ctx.ranges.length > 0) {
		return ctx.ranges.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
	}
	return ctx.content.split('\n').length;
}

/** Render one context block: file header + rule + syntax-highlighted lines with gutter. */
async function renderContextBlock(ctx: DisplaySearchContext, expanded: boolean, width: number): Promise<string> {
	const tw = width;
	const lg = lang(ctx.file);

	// Prefer SDK-provided sourceBlocks (clean per-range lines, no markers).
	// Fall back to splitting ctx.content for the '*' / no-patch case.
	const subBlocks: CodeSubBlock[] =
		ctx.sourceBlocks != null && ctx.sourceBlocks.length > 0
			? ctx.sourceBlocks.map((b) => ({ startLine: b.startLine, lines: b.lines }))
			: splitIntoSubBlocks(ctx.content, ctx.lineRanges, ctx.ranges);

	// Compute max end line for gutter width
	const lastBlock = subBlocks[subBlocks.length - 1];
	const maxLine = lastBlock != null ? lastBlock.startLine + lastBlock.lines.length - 1 : 1;
	const nw = Math.max(3, String(maxLine).length);
	const gw = nw + 3;
	const cw = Math.max(20, tw - gw);

	const icon = fileIcon(ctx.file);
	const count = contextLineCount(ctx);
	const header = `${icon} ${BOLD}${ctx.file}${RST}  ${FG_DIM}lines ${ctx.lineRanges}  ${count}L${RST}`;
	const out: string[] = [header, rule(tw)];

	for (let bi = 0; bi < subBlocks.length; bi++) {
		const block = subBlocks[bi];
		if (block == null) continue;
		const highlighted = await hlBlock(block.lines.join('\n'), lg);
		const rows = renderSubBlock(highlighted, block.lines, block.startLine, nw, cw, expanded);
		out.push(...rows);
		// Gap separator between non-contiguous blocks — like pi-diff hunk separators
		if (bi < subBlocks.length - 1) {
			const next = subBlocks[bi + 1];
			const skipped = next != null ? next.startLine - (block.startLine + block.lines.length) : 0;
			const label = skipped > 0 ? ` ${skipped} skipped lines ` : ' ··· ';
			const ruleW = Math.min(tw, 72);
			const pad = Math.max(0, ruleW - label.length - 2);
			const h1 = Math.floor(pad / 2);
			const h2 = pad - h1;
			out.push(`${FG_DIM}${'─'.repeat(h1)}${label}${'─'.repeat(h2)}${RST}`);
		}
	}

	out.push(rule(tw));
	if (ctx.truncated) out.push(`${FG_DIM}  … truncated — refine searchTerm for more${RST}`);
	return out.join('\n');
}

/** Async render all context blocks for the expanded result. */
async function renderExpandedBody(details: CodebaseSearchDetails, width: number): Promise<string> {
	const blocks = await Promise.all(details.contexts.map((ctx) => renderContextBlock(ctx, true, width)));
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
	return details.contexts
		.map((ctx) => {
			const count = contextLineCount(ctx);
			return `  ${FG_DIM}${ctx.file}:${ctx.lineRanges}  ${count}L${RST}`;
		})
		.join('\n');
}

function formatStep(step: WarpGrepStep): string {
	const calls = step.toolCalls.map((call) => call.name).join(', ') || 'thinking';
	return `Codebase Search turn ${step.turn}: ${calls}`;
}

export function registerCodebaseSearchTool(pi: ExtensionAPI, options: RegisterCodebaseSearchToolOptions = {}): void {
	const toolName = options.name ?? 'codebase_search';
	const toolLabel = options.label ?? 'Codebase Search';
	const resolveApiKey =
		options.resolveApiKey ??
		((ctx: CodebaseSearchExecutionContext) => ensureMorphApiKey(ctx.modelRegistry.authStorage));
	const resolveRuntimeConfig = options.resolveRuntimeConfig ?? getMorphRuntimeConfig;
	const resolveRepoRoot =
		options.resolveRepoRoot ??
		((ctx: CodebaseSearchExecutionContext, repoRoot: string | undefined) =>
			resolveWorkspaceDirectory(ctx.cwd, repoRoot));
	const createProvider =
		options.createProvider ??
		((repoRoot: string, providerOptions: SafeWarpGrepProviderOptions) =>
			createSafeWarpGrepProvider(repoRoot, providerOptions));
	// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Type.Composite returns a TObject structurally compatible with CodebaseSearchParams; downstream code only relies on the base schema fields.
	const parameters = (
		options.extendParameters ? Type.Composite([CodebaseSearchParams, options.extendParameters]) : CodebaseSearchParams
	) as typeof CodebaseSearchParams;
	interface SearchRenderState {
		key?: string;
		body?: string | null;
	}

	pi.registerTool<typeof CodebaseSearchParams, Partial<CodebaseSearchDetails>, SearchRenderState>({
		name: toolName,
		label: toolLabel,
		description:
			options.description ??
			'Very fast code search exploration subagent (not a grep tool) that runs parallel grep and file read calls over multiple turns to locate relevant files and line ranges. The search term should be a targeted natural-language query describing what you are trying to find or accomplish, e.g. "Find where authentication requests are handled in the Express routes" or "How do callers of processOrder handle the error case?". Fill in extra context you can infer to make the query specific. Do not pass bare keywords or symbol names — use grep directly for exact symbol lookups. Use this tool first when exploring unfamiliar code. The results may be partial — follow up with classical search tools or direct file reads if needed.',
		promptSnippet:
			options.promptSnippet ??
			'codebase_search: semantic/exploratory code questions. grep/find for exact strings or filenames.',
		promptGuidelines: options.promptGuidelines ?? [
			'codebase_search: use for broad questions about where behavior lives, not for exact strings or filenames — grep/find are faster and use no API budget.',
		],
		parameters,

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
			const component = getWidthAwareText(context);
			component.setRenderer((width: number) => {
				const key = `search:${details.searchTerm}:${details.contextCount}:${details.shownContextCount}:${width}`;
				if (context.state.key !== key) {
					context.state.key = key;
					context.state.body = null;

					if (fullDetails != null) {
						renderExpandedBody(fullDetails, width)
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
				return `${header}\n\n${body}`;
			});
			return component;
		},

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			return executeCodebaseSearch({
				input: {
					searchTerm: params.searchTerm,
					...(params.repoRoot != null ? { repoRoot: params.repoRoot } : {}),
					...(params.includes != null ? { includes: params.includes } : {}),
					...(params.excludes != null ? { excludes: params.excludes } : {}),
					...(params.searchType != null ? { searchType: params.searchType } : {}),
				},
				ctx: { cwd: ctx.cwd, modelRegistry: ctx.modelRegistry, params },
				...(signal != null ? { signal } : {}),
				onUpdate,
				resolveApiKey,
				resolveRuntimeConfig,
				resolveRepoRoot,
				createProvider,
			});
		},
	});
}
