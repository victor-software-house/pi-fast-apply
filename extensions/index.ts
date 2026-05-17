import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerMorphCommands } from './commands';
import { registerFastApplyTool } from './fast-apply-tool';

export default function fastApplyExtension(pi: ExtensionAPI): void {
	registerFastApplyTool(pi);
	registerMorphCommands(pi);
}
