/**
 * Type stub for pi-diff/render.
 *
 * pi-diff ships TypeScript source only (no compiled .d.ts). Under our strict
 * tsconfig the raw source triggers errors in noUncheckedIndexedAccess and
 * exactOptionalPropertyTypes. This stub provides the types we consume so tsc
 * never touches pi-diff's source. Keep in sync with node_modules/pi-diff/src/render.ts.
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
