import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerCodebaseSearchTool } from './codebase-search-tool';
import { registerMorphCommands } from './commands';
import { registerQuickEditTool } from './quick-edit-tool';

function envEnabled(envVar: string, defaultValue = true): boolean {
	const val = process.env[envVar]?.trim().toLowerCase();
	if (val == null || val === '') return defaultValue;
	return val !== 'false' && val !== '0' && val !== 'off' && val !== 'no';
}

export default function fastApplyExtension(pi: ExtensionAPI): void {
	if (envEnabled('MORPH_EDIT')) registerQuickEditTool(pi);
	if (envEnabled('MORPH_WARPGREP')) registerCodebaseSearchTool(pi);
	registerMorphCommands(pi);

	// Expose package skills for on-demand loading by the model.
	pi.on('resources_discover', () => ({
		skillPaths: [new URL('../skills', import.meta.url).pathname],
	}));
}
