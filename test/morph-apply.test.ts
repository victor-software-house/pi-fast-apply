import { describe, expect, it } from 'vitest';
import { validateInputForExistingFile } from '../extensions/morph-apply';

const marker = '// ... existing code ...';

describe('validateInputForExistingFile', () => {
	it('requires marker-delimited sparse edits for existing files', () => {
		expect(() => validateInputForExistingFile('export const value = 2;\n', 'export const value = 1;\n')).toThrow(
			'use write for full-file replacement',
		);
	});

	it('accepts sparse edits with existing-code markers', () => {
		expect(() =>
			validateInputForExistingFile(`${marker}\nexport const value = 2;\n${marker}\n`, 'export const value = 1;\n'),
		).not.toThrow();
	});
});
