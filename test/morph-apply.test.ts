import { describe, expect, it } from 'vitest';
import { validateInputForExistingFile } from '../extensions/morph-apply';

const marker = '// ... existing code ...';

describe('validateInputForExistingFile', () => {
	it('allows markerless snippets because guidance is non-blocking', () => {
		expect(() => validateInputForExistingFile('export const value = 2;\n', 'export const value = 1;\n')).not.toThrow();
	});

	it('accepts sparse edits with existing-code markers', () => {
		expect(() =>
			validateInputForExistingFile(`${marker}\nexport const value = 2;\n${marker}\n`, 'export const value = 1;\n'),
		).not.toThrow();
	});
});
