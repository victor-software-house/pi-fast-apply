import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { type RegisterCodebaseSearchToolOptions, registerCodebaseSearchTool } from './codebase-search-tool';
import { registerMorphCommands } from './commands';
import { type RegisterQuickEditToolOptions, registerQuickEditTool } from './quick-edit-tool';

export type { MorphAuthResolution, MorphAuthSource } from './auth';
export { ensureMorphApiKey, morphAuthSourceLabel, resolveMorphApiKey } from './auth';
export type { RegisterCodebaseSearchToolOptions, SafeWarpGrepProviderOptions } from './codebase-search-tool';
export {
	createSafeWarpGrepProvider,
	registerCodebaseSearchTool,
	resolveWorkspaceDirectory,
} from './codebase-search-tool';
export type { QuickEditFileOps, RegisterQuickEditToolOptions } from './quick-edit-tool';
export { createLocalQuickEditFileOps, registerQuickEditTool } from './quick-edit-tool';
export type { MorphRuntimeConfig } from './runtime-config';
export { buildApplyConfig, buildWarpGrepConfig, getMorphRuntimeConfig } from './runtime-config';

export interface RegisterMorphToolsOptions {
	quickEdit?: RegisterQuickEditToolOptions;
	codebaseSearch?: RegisterCodebaseSearchToolOptions;
}

function envEnabled(envVar: string, defaultValue = true): boolean {
	const val = process.env[envVar]?.trim().toLowerCase();
	if (val == null || val === '') return defaultValue;
	return val !== 'false' && val !== '0' && val !== 'off' && val !== 'no';
}

export function registerMorphTools(pi: ExtensionAPI, options: RegisterMorphToolsOptions = {}): void {
	if (envEnabled('MORPH_EDIT')) registerQuickEditTool(pi, options.quickEdit);
	if (envEnabled('MORPH_WARPGREP')) registerCodebaseSearchTool(pi, options.codebaseSearch);
}

export default function fastApplyExtension(pi: ExtensionAPI): void {
	registerMorphTools(pi);
	registerMorphCommands(pi);
}
