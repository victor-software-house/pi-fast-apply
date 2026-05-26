import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: {
		index: 'extensions/index.ts',
	},
	format: ['esm'],
	dts: true,
	sourcemap: true,
	clean: true,
	target: 'node24',
	platform: 'node',
	unbundle: true,
});
