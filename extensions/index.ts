import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerCodebaseSearchTool } from './codebase-search-tool';
import { registerMorphCommands } from './commands';
import { registerFastApplyTool } from './fast-apply-tool';
import { registerQuickEditTool } from './quick-edit-tool';

function envEnabled(envVar: string, defaultValue = true): boolean {
	const val = process.env[envVar]?.trim().toLowerCase();
	if (val == null || val === '') return defaultValue;
	return val !== 'false' && val !== '0' && val !== 'off' && val !== 'no';
}

export default function fastApplyExtension(pi: ExtensionAPI): void {
	if (envEnabled('MORPH_EDIT')) registerFastApplyTool(pi);
	if (envEnabled('MORPH_WARPGREP')) registerCodebaseSearchTool(pi);
	registerQuickEditTool(pi);
	registerMorphCommands(pi);

	// Replace the built-in 'edit' tool with our 'quick_edit' so the model
	// sees a self-descriptive name. Run on every session start so the active
	// tool set stays correct after session tree navigation.
	const hideBuiltinEdit = () => {
		pi.setActiveTools(pi.getActiveTools().filter((name) => name !== 'edit'));
	};

	pi.on('session_start', hideBuiltinEdit);
	pi.on('session_tree', hideBuiltinEdit);
}
