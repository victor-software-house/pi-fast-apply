declare module 'pi-diff/render' {
	interface DiffLine {
		type: 'add' | 'del' | 'ctx' | 'sep';
		oldNum: number | null;
		newNum: number | null;
		content: string;
	}

	interface ParsedDiff {
		lines: DiffLine[];
		added: number;
		removed: number;
		chars: number;
	}

	interface DiffColors {
		fgAdd: string;
		fgDel: string;
		fgCtx: string;
	}

	interface PrettifyConfig {
		theme: string;
		maxPreviewLines: number;
		maxHighlightChars: number;
		cacheLimit: number;
		maxDiffLines: number;
		splitMinWidth: number;
		splitMinCodeWidth: number;
		wordDiffMinSimilarity: number;
		diffTheme: string | null;
		diffColors: Record<string, string>;
		maxTermWidth: number;
		termMargin: number;
		maxWrapRows: number | null;
		imageMaxCols: number;
	}

	export function parseDiff(oldContent: string, newContent: string, ctx?: number, lineOffset?: number): ParsedDiff;
	export function renderSplit(
		diff: ParsedDiff,
		language: string | undefined,
		max?: number,
		dc?: DiffColors,
		wrapRows?: number,
	): Promise<string>;
	export function renderUnified(
		diff: ParsedDiff,
		language: string | undefined,
		max?: number,
		dc?: DiffColors,
		wrapRows?: number,
	): Promise<string>;
	export function hlBlock(code: string, language: string | undefined): Promise<string[]>;
	export function summarize(added: number, removed: number): string;
	export function lang(filePath: string): string | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: Pi theme object has no public type
	export function resolveDiffColors(theme: any): DiffColors;
	export function termW(): number;
	export function shortPath(cwd: string, home: string, filePath: string): string;

	export const cfg: PrettifyConfig;
	export const ANSI_RE: RegExp;

	export type { DiffColors, DiffLine, ParsedDiff, PrettifyConfig };
}
