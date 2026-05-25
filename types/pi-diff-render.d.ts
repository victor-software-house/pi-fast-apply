/**
 * Type stub for @victor-software-house/pi-diff/render.
 *
 * Keep this stub narrow to the symbols pi-fast-apply consumes from the
 * published render export. Runtime imports must use the scoped package export,
 * not a local source path or package alias.
 */

// Primitives re-exported from @victor-software-house/pi-render-core
export { cfg, hlBlock, hlBlockBash, lang, shortPath, termW } from '@victor-software-house/pi-render-core';
export type { PrettifyConfig } from '@victor-software-house/pi-render-core';

// DiffColors / DiffPalette
export type DiffPalette = {
	bgAdd?: string;
	bgDel?: string;
	bgAddHighlight?: string;
	bgDelHighlight?: string;
	bgGutterAdd?: string;
	bgGutterDel?: string;
	bgEmpty?: string;
	shikiTheme?: string;
};
export type DiffColors = DiffPalette;

// ParsedDiff — result of parseDiff()
export interface ParsedDiff {
	added: number;
	removed: number;
	lines: DiffLine[];
}

export interface DiffLine {
	type: 'add' | 'del' | 'ctx';
	lineA: number | null;
	lineB: number | null;
	content: string;
}

// Functions used by quick-edit-tool.ts
export declare function parseDiff(original: string, modified: string): ParsedDiff;
export declare function renderSplit(
	diff: ParsedDiff,
	language: string | undefined,
	maxLines: number,
	colors: DiffColors,
	maxWrapRows?: number,
): Promise<string>;
export declare function resolveDiffColors(theme: unknown): DiffColors;

// lang re-exported under the alias used in quick-edit-tool.ts
export { lang as diffLang } from '@victor-software-house/pi-render-core';
