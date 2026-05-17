import { applyEdit } from '@morphllm/morphsdk';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// Run with: mise run test:morph-matrix
// The key is read from MORPH_API_KEY and never printed.
const apiKey = process.env.MORPH_API_KEY;

const longA = 'age1testvalue_' + 'A'.repeat(420) + '_end';
const longB = 'base64_' + 'B'.repeat(520) + '_end';

const scenarios = [
  {
    id: 'S01',
    name: 'Small JS validation',
    instruction: 'I am adding number validation to the add function.',
    original: `function add(a, b) {\n  return a + b;\n}\n`,
    edit: `function add(a, b) {\n  if (typeof a !== 'number' || typeof b !== 'number') {\n    throw new TypeError('Expected numbers');\n  }\n  return a + b;\n}\n`,
    checks: [
      ['adds validation', (s) => s.includes('Expected numbers')],
      ['keeps return', (s) => s.includes('return a + b')],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
  {
    id: 'S02',
    name: 'Multi-hunk TypeScript import + options + body',
    instruction: 'I am adding logger support and retry configuration to fetchUser.',
    original: `import { request } from './http';\n\ninterface FetchUserOptions {\n  includePosts?: boolean;\n}\n\nexport async function fetchUser(id: string, options: FetchUserOptions = {}) {\n  const response = await request('/users/' + id, {\n    query: { includePosts: options.includePosts ?? false },\n  });\n\n  return response.json();\n}\n`,
    edit: `import { request } from './http';\nimport { logger } from './logger';\n\ninterface FetchUserOptions {\n  includePosts?: boolean;\n  retries?: number;\n}\n\nexport async function fetchUser(id: string, options: FetchUserOptions = {}) {\n  logger.info('fetching user', { id });\n  const response = await request('/users/' + id, {\n    query: { includePosts: options.includePosts ?? false },\n    retries: options.retries ?? 2,\n  });\n\n  return response.json();\n}\n`,
    checks: [
      ['adds logger import', (s) => s.includes("import { logger } from './logger'")],
      ['adds retries option', (s) => s.includes('retries?: number')],
      ['uses logger', (s) => s.includes('logger.info')],
      ['passes retries', (s) => s.includes('retries: options.retries ?? 2')],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
  {
    id: 'S03',
    name: 'Delete helper and update caller',
    instruction: 'I am removing the legacyNormalize helper and using normalizeName directly.',
    original: `function normalizeName(value) {\n  return value.trim().toLowerCase();\n}\n\nfunction legacyNormalize(value) {\n  return normalizeName(value).replace(/_/g, '-');\n}\n\nexport function buildSlug(input) {\n  return legacyNormalize(input);\n}\n`,
    edit: `function normalizeName(value) {\n  return value.trim().toLowerCase();\n}\n\nexport function buildSlug(input) {\n  return normalizeName(input);\n}\n`,
    checks: [
      ['removes helper', (s) => !s.includes('function legacyNormalize')],
      ['uses normalizeName', (s) => s.includes('return normalizeName(input)')],
      ['keeps normalizeName', (s) => s.includes('function normalizeName')],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
  {
    id: 'S04',
    name: 'Long-value preservation with placeholder',
    instruction: 'I am adding a request timeout setting while preserving existing secret-like values.',
    original: `export const settings = {\n  encryptedToken: '${longA}',\n  encodedPayload: '${longB}',\n  retries: 2,\n};\n`,
    edit: `export const settings = {\n  // ... existing code ...\n  retries: 2,\n  requestTimeoutMs: 30000,\n};\n`,
    checks: [
      ['preserves longA', (s) => s.includes(longA)],
      ['preserves longB', (s) => s.includes(longB)],
      ['adds timeout', (s) => s.includes('requestTimeoutMs: 30000')],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
  {
    id: 'S05',
    name: 'Duplicate context disambiguation',
    instruction: 'I am enabling audit logging only for the admin route.',
    original: `export const publicRoute = {\n  path: '/public',\n  audit: false,\n  handler: handlePublic,\n};\n\nexport const adminRoute = {\n  path: '/admin',\n  audit: false,\n  handler: handleAdmin,\n};\n`,
    edit: `// ... existing code ...\nexport const adminRoute = {\n  path: '/admin',\n  audit: true,\n  handler: handleAdmin,\n};\n`,
    checks: [
      ['keeps public false', (s) => /publicRoute[\s\S]*audit: false/.test(s)],
      ['sets admin true', (s) => /adminRoute[\s\S]*audit: true/.test(s)],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
  {
    id: 'S06',
    name: 'Python error handling',
    instruction: 'I am adding explicit FileNotFoundError handling to load_config.',
    original: `import json\n\ndef load_config(path):\n    with open(path) as fh:\n        return json.load(fh)\n`,
    edit: `import json\n\ndef load_config(path):\n    try:\n        with open(path) as fh:\n            return json.load(fh)\n    except FileNotFoundError as exc:\n        raise RuntimeError(f'Config not found: {path}') from exc\n`,
    checks: [
      ['adds try', (s) => s.includes('try:')],
      ['handles FileNotFoundError', (s) => s.includes('except FileNotFoundError as exc')],
      ['raises RuntimeError', (s) => s.includes('Config not found')],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
  {
    id: 'S07',
    name: 'Markdown section insertion',
    instruction: 'I am adding a troubleshooting section after installation.',
    original: `# Tool\n\n## Install\n\nRun pnpm install.\n\n## Usage\n\nRun pnpm dev.\n`,
    edit: `# Tool\n\n## Install\n\nRun pnpm install.\n\n## Troubleshooting\n\nIf install fails, run pnpm install --force and retry.\n\n## Usage\n\nRun pnpm dev.\n`,
    checks: [
      ['adds heading', (s) => s.includes('## Troubleshooting')],
      ['keeps usage after troubleshooting', (s) => /Troubleshooting[\s\S]*## Usage/.test(s)],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
  {
    id: 'S08',
    name: 'CSS duplicate selector target',
    instruction: 'I am increasing only the primary button font weight.',
    original: `.button {\n  border-radius: 4px;\n  font-weight: 400;\n}\n\n.button.primary {\n  background: blue;\n  font-weight: 500;\n}\n\n.button.secondary {\n  background: gray;\n  font-weight: 500;\n}\n`,
    edit: `// ... existing code ...\n.button.primary {\n  background: blue;\n  font-weight: 700;\n}\n// ... existing code ...\n`,
    checks: [
      ['primary 700', (s) => /button\.primary[\s\S]*font-weight: 700/.test(s)],
      ['secondary still 500', (s) => /button\.secondary[\s\S]*font-weight: 500/.test(s)],
      ['base still 400', (s) => /\.button \{[\s\S]*font-weight: 400/.test(s)],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
  {
    id: 'S09',
    name: 'Nested config object edit',
    instruction: 'I am enabling metrics while preserving existing service config.',
    original: `export const config = {\n  service: {\n    host: 'localhost',\n    port: 3000,\n  },\n  metrics: {\n    enabled: false,\n    sampleRate: 0.1,\n  },\n};\n`,
    edit: `export const config = {\n  // ... existing code ...\n  metrics: {\n    enabled: true,\n    sampleRate: 0.25,\n  },\n};\n`,
    checks: [
      ['keeps host', (s) => s.includes("host: 'localhost'")],
      ['keeps port', (s) => s.includes('port: 3000')],
      ['metrics true', (s) => /metrics[\s\S]*enabled: true/.test(s)],
      ['sampleRate updated', (s) => s.includes('sampleRate: 0.25')],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
  {
    id: 'S10',
    name: 'Java class method addition',
    instruction: 'I am adding a disabled-account check before returning access.',
    original: `public class AccessPolicy {\n    public boolean canAccess(User user) {\n        if (user == null) {\n            return false;\n        }\n        return user.hasRole("admin");\n    }\n}\n`,
    edit: `public class AccessPolicy {\n    public boolean canAccess(User user) {\n        if (user == null) {\n            return false;\n        }\n        if (user.isDisabled()) {\n            return false;\n        }\n        return user.hasRole("admin");\n    }\n}\n`,
    checks: [
      ['adds disabled check', (s) => s.includes('user.isDisabled()')],
      ['keeps null check', (s) => s.includes('user == null')],
      ['keeps role check', (s) => s.includes('user.hasRole("admin")')],
      ['no marker leak', (s) => !s.includes('existing code')],
    ],
  },
];

const transports = [
  { id: 'sdk-default-omitted', label: 'Patched SDK default omitted', expectedModel: 'auto', run: async (c) => sdk(c, {}) },
  { id: 'sdk-fast-large-false', label: 'SDK large=false', expectedModel: 'morph-v3-fast', run: async (c) => sdk(c, { large: false }) },
  { id: 'sdk-large-true', label: 'SDK large=true', expectedModel: 'morph-v3-large', run: async (c) => sdk(c, { large: true }) },
  { id: 'raw-chat-fast', label: 'Raw chat fast', expectedModel: 'morph-v3-fast', run: async (c) => rawChat(c, 'morph-v3-fast') },
  { id: 'raw-chat-large', label: 'Raw chat large', expectedModel: 'morph-v3-large', run: async (c) => rawChat(c, 'morph-v3-large') },
  { id: 'raw-chat-auto', label: 'Raw chat auto', expectedModel: 'auto', run: async (c) => rawChat(c, 'auto') },
  { id: 'code-apply-default-auto', label: 'Code Apply default', expectedModel: 'auto default', run: async (c) => codeApply(c) },
  { id: 'code-apply-fast', label: 'Code Apply fast', expectedModel: 'morph-v3-fast', run: async (c) => codeApply(c, 'morph-v3-fast') },
  { id: 'code-apply-large', label: 'Code Apply large', expectedModel: 'morph-v3-large', run: async (c) => codeApply(c, 'morph-v3-large') },
  { id: 'code-apply-auto', label: 'Code Apply auto', expectedModel: 'auto', run: async (c) => codeApply(c, 'auto') },
];

async function sdk(c, config) {
  const r = await applyEdit(
    { originalCode: c.original, codeEdit: c.edit, instruction: c.instruction },
    { morphApiKey: apiKey, timeout: 60_000, ...config },
  );
  if (!r.success) throw new Error(r.error ?? 'sdk failed');
  return r.mergedCode ?? '';
}

async function rawChat(c, model) {
  const res = await fetch('https://api.morphllm.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: `<instruction>${c.instruction}</instruction>\n<code>${c.original}</code>\n<update>${c.edit}</update>` }],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text).choices?.[0]?.message?.content ?? '';
}

async function codeApply(c, model) {
  const res = await fetch('https://api.morphllm.com/v1/code/apply', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      initial_code: c.original,
      edit_snippet: c.edit,
      instructions: c.instruction,
      ...(model ? { model } : {}),
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  return json.mergedCode ?? json.merged_code ?? '';
}

function normalize(s) {
  return s.replace(/\s+$/g, '').trim();
}

function hash(s) {
  return createHash('sha256').update(normalize(s)).digest('hex').slice(0, 12);
}

function fenceLang(name) {
  if (/Python/.test(name)) return 'python';
  if (/Markdown/.test(name)) return 'markdown';
  if (/CSS/.test(name)) return 'css';
  if (/Java /.test(name)) return 'java';
  if (/TypeScript|config|Duplicate|Long|Small|Delete/.test(name)) return 'ts';
  return 'text';
}

async function runMatrix() {
  if (!apiKey) throw new Error('missing MORPH_API_KEY');

  const started = new Date().toLocaleString();
  const runsPerPath = 3;
  const results = [];
  for (let run = 1; run <= runsPerPath; run++) {
    for (const scenario of scenarios) {
      for (const transport of transports) {
        const start = performance.now();
        try {
          const merged = await transport.run(scenario);
          const ms = Math.round(performance.now() - start);
          const failed = scenario.checks.filter(([, fn]) => !fn(merged)).map(([name]) => name);
          results.push({ run, scenario, transport, ok: failed.length === 0, failed, ms, merged, hash: hash(merged) });
          console.log(`${failed.length === 0 ? 'PASS' : 'FAIL'} run=${run} ${scenario.id} ${transport.id} ${ms}ms ${hash(merged)}`);
        } catch (error) {
          const ms = Math.round(performance.now() - start);
          results.push({ run, scenario, transport, ok: false, failed: [error?.message ?? String(error)], ms, merged: '', hash: 'error' });
          console.log(`FAIL run=${run} ${scenario.id} ${transport.id} ${ms}ms ${error?.message ?? error}`);
        }
      }
    }
  }

  const total = results.length;
  const failed = results.filter((r) => !r.ok).length;
  const byTransport = transports.map((t) => {
    const subset = results.filter((r) => r.transport.id === t.id);
    const pass = subset.filter((r) => r.ok).length;
    const avg = Math.round(subset.reduce((sum, r) => sum + r.ms, 0) / subset.length);
    const min = Math.min(...subset.map((r) => r.ms));
    const max = Math.max(...subset.map((r) => r.ms));
    return { ...t, pass, avg, min, max };
  });

  let summary = `# Morph Apply Behavior Matrix\n\n`;
  summary += `Generated: ${started}\n\n`;
  summary += `API key source: environment variable \`MORPH_API_KEY\`; value not printed. Requests ran sequentially from the repo root. Timings are wall-clock milliseconds measured around each API/SDK call.\n\n`;
  summary += `## Direct answer\n\n`;
  summary += `* Published SDK does **not** expose \`auto\`.\n`;
  summary += `* This repo patches \`@morphllm/morphsdk@0.2.171\` with \`model?: 'auto' | 'morph-v3-fast' | 'morph-v3-large'\`.\n`;
  summary += `* Patched SDK \`large\` omitted resolves to \`auto\`, then sends that model to \`/v1/chat/completions\`.\n`;
  summary += `* Patched SDK \`large: false\` sends \`morph-v3-fast\`.\n`;
  summary += `* Patched SDK \`large: true\` sends \`morph-v3-large\`.\n`;
  summary += `* Raw Chat and Code Apply both accept \`auto\` in live tests.\n\n`;
  summary += `## Request paths tested\n\n`;
  summary += `| Path | Model sent / implied | Notes |\n|:--|:--|:--|\n`;
  for (const t of transports) summary += `| ${t.label} | \`${t.expectedModel}\` | ${t.id} |\n`;
  summary += `\n## Aggregate results\n\n`;
  summary += `Runs per scenario/path: ${runsPerPath}. Total calls: ${total}; failed: ${failed}.\n\n`;
  summary += `| Transport | Pass | Avg ms | Min ms | Max ms |\n|:--|--:|--:|--:|--:|\n`;
  for (const row of byTransport) summary += `| ${row.label} | ${row.pass}/${scenarios.length * runsPerPath} | ${row.avg} | ${row.min} | ${row.max} |\n`;
  summary += `\n## Per-scenario comparison\n\n`;
  for (const scenario of scenarios) {
    const rows = results.filter((r) => r.scenario.id === scenario.id);
    const hashes = [...new Set(rows.map((r) => r.hash))];
    const groupedRows = transports.map((transport) => {
      const subset = rows.filter((r) => r.transport.id === transport.id);
      const pass = subset.filter((r) => r.ok).length;
      const avg = Math.round(subset.reduce((sum, r) => sum + r.ms, 0) / subset.length);
      const min = Math.min(...subset.map((r) => r.ms));
      const max = Math.max(...subset.map((r) => r.ms));
      const rowHashes = [...new Set(subset.map((r) => r.hash))];
      const failed = [...new Set(subset.flatMap((r) => r.failed))];
      return { transport, pass, avg, min, max, hashes: rowHashes, failed };
    });
    summary += `### ${scenario.id}: ${scenario.name}\n\n`;
    summary += `Instruction: ${scenario.instruction}\n\n`;
    summary += `Result groups: ${hashes.length} unique normalized output hash${hashes.length === 1 ? '' : 'es'}.\n\n`;
    summary += `| Transport | Pass | Avg ms | Min ms | Max ms | Hashes | Failed checks |\n|:--|:--:|--:|--:|--:|:--|:--|\n`;
    for (const r of groupedRows) summary += `| ${r.transport.label} | ${r.pass}/${runsPerPath} | ${r.avg} | ${r.min} | ${r.max} | ${r.hashes.map((h) => `\`${h}\``).join(', ')} | ${r.failed.join('; ')} |\n`;
    const first = rows.find((r) => r.merged)?.merged ?? '';
    summary += `\nRepresentative merged output:\n\n\`\`\`${fenceLang(scenario.name)}\n${first}\n\`\`\`\n\n`;
  }

  let scenariosMd = `# Morph Apply Matrix Scenarios\n\n`;
  scenariosMd += `Generated: ${started}\n\n`;
  scenariosMd += `These are exact inputs used by \`docs/morph-apply-behavior-matrix.md\`. Each scenario/path pair ran ${runsPerPath} times.\n\n`;
  for (const scenario of scenarios) {
    scenariosMd += `## ${scenario.id}: ${scenario.name}\n\n`;
    scenariosMd += `Instruction: ${scenario.instruction}\n\n`;
    scenariosMd += `Checks:\n\n`;
    for (const [name] of scenario.checks) scenariosMd += `* ${name}\n`;
    scenariosMd += `\nOriginal:\n\n\`\`\`${fenceLang(scenario.name)}\n${scenario.original}\n\`\`\`\n\n`;
    scenariosMd += `Edit snippet:\n\n\`\`\`${fenceLang(scenario.name)}\n${scenario.edit}\n\`\`\`\n\n`;
  }

  await mkdir('docs', { recursive: true });
  await writeFile('docs/morph-apply-behavior-matrix.md', summary);
  await writeFile('docs/morph-apply-scenarios.md', scenariosMd);
  return { failed, total };
}

describe('Morph Apply live matrix', () => {
  it.skipIf(!apiKey)('passes all scenarios across SDK and raw API paths', async () => {
    const result = await runMatrix();
    expect(result.failed).toBe(0);
    expect(result.total).toBe(scenarios.length * transports.length * 3);
  }, 900_000);
});