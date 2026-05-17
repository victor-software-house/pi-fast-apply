import { extname, isAbsolute, relative, resolve } from 'node:path';
import { scan as scanSecrets } from '@sanity-labs/secret-scan';
import { lintSource } from '@secretlint/core';
import { creator as recommendedSecretlintRules } from '@secretlint/secretlint-rule-preset-recommend';

const REDACTED_SEARCH_CONTENT = '[REDACTED] codebase_search found sensitive file content; content omitted.';
const MASK_CHARACTER = '*';
const SECRET_ASSIGNMENT_PATTERN =
	/\b(?:[a-z0-9]+[_-])?(?:api[_-]?key|access[_-]?key|auth|client[_-]?secret|credential|password|passwd|private[_-]?key|pwd|secret|token)\b\s*[:=]\s*["']?[^"'\s,}]{6,}/i;

interface SecretRedactionResult {
	content: string;
}

function maskRange(content: string, start: number, end: number): string {
	return content.slice(0, start) + MASK_CHARACTER.repeat(Math.max(0, end - start)) + content.slice(end);
}

async function redactSecrets(content: string, filePath: string): Promise<SecretRedactionResult> {
	const result = await lintSource({
		source: {
			content,
			contentType: 'text',
			ext: extname(filePath),
			filePath,
		},
		options: {
			config: {
				rules: [
					{
						id: '@secretlint/secretlint-rule-preset-recommend',
						rule: recommendedSecretlintRules,
					},
				],
			},
			maskSecrets: true,
			noPhysicFilePath: true,
		},
	});

	const ranges = result.messages
		.map((message) => message.range)
		.filter((range): range is [number, number] => Array.isArray(range) && range.length === 2)
		.sort((left, right) => right[0] - left[0]);
	const redacted = ranges.reduce((current, [start, end]) => maskRange(current, start, end), content);
	return { content: redacted };
}

function isSensitiveContentPath(repoRoot: string, candidatePath: string): boolean {
	const absolutePath = resolve(repoRoot, candidatePath);
	const relativePath = relative(repoRoot, absolutePath);
	if (relativePath.startsWith('..') || isAbsolute(relativePath)) return true;
	if (relativePath === '') return false;

	const normalizedPath = relativePath.replaceAll('\\', '/').toLowerCase();
	const parts = normalizedPath.split('/');
	const name = parts.at(-1) ?? '';
	const blockedNames = new Set([
		'.env',
		'.netrc',
		'.npmrc',
		'.pypirc',
		'auth.json',
		'credentials.json',
		'id_rsa',
		'id_dsa',
		'id_ecdsa',
		'id_ed25519',
		'secrets.json',
		'secrets.yaml',
		'secrets.yml',
		'service-account.json',
		'service_account.json',
		'token.json',
		'tokens.json',
	]);
	const blockedExtensions = ['.pem', '.key', '.p12', '.pfx', '.ppk', '.asc', '.gpg', '.agekey', '.log'];

	return (
		normalizedPath === '.docker/config.json' ||
		normalizedPath === '.kube/config' ||
		name.startsWith('.env.') ||
		name.endsWith('.kubeconfig') ||
		blockedNames.has(name) ||
		name.startsWith('id_rsa') ||
		name.startsWith('id_dsa') ||
		name.startsWith('id_ecdsa') ||
		name.startsWith('id_ed25519') ||
		blockedExtensions.some((extension) => name.endsWith(extension))
	);
}

function redactReadLine(line: string, index: number): string {
	const lineNumber = /^(\d+)\|/.exec(line)?.[1] ?? String(index + 1);
	return `${lineNumber}|${REDACTED_SEARCH_CONTENT}`;
}

function grepLineParts(line: string): { filePath: string; marker: string } | undefined {
	if (line === '--') return undefined;
	const match = /^(.+?)([:-]\d+[:-])/.exec(line);
	if (match == null) return undefined;
	return { filePath: match[1] ?? '', marker: match[2] ?? ':' };
}

function redactGrepLine(line: string): string {
	const parts = grepLineParts(line);
	if (parts == null) return REDACTED_SEARCH_CONTENT;
	return `${parts.filePath}${parts.marker}${REDACTED_SEARCH_CONTENT}`;
}

export async function containsDetectedSecret(content: string, filePath = '<codebase_search-query>'): Promise<boolean> {
	if (SECRET_ASSIGNMENT_PATTERN.test(content)) return true;
	if (scanSecrets(content).length > 0) return true;
	const redacted = await redactSecrets(content, filePath);
	return redacted.content !== content;
}

export async function redactReadLines(lines: string[], filePath: string, repoRoot: string): Promise<string[]> {
	if (lines.length === 0) return lines;
	if (isSensitiveContentPath(repoRoot, filePath)) return lines.map(redactReadLine);
	const redacted = await redactSecrets(lines.join('\n'), filePath);
	return redacted.content.split('\n');
}

export async function redactGrepLines(lines: string[], filePath: string, repoRoot: string): Promise<string[]> {
	if (lines.length === 0) return lines;
	const redacted = await redactSecrets(lines.join('\n'), filePath);
	return redacted.content.split('\n').map((line, index) => {
		const originalLine = lines[index] ?? line;
		const parts = grepLineParts(originalLine);
		if (parts == null || !isSensitiveContentPath(repoRoot, parts.filePath)) return line;
		return redactGrepLine(originalLine);
	});
}
