# Morph API Reference for pi-fast-apply

Distilled reference of the Morph API surface relevant to this package. Source: [docs.morphllm.com/llms-full.txt](https://docs.morphllm.com/llms-full.txt) (reviewed 2026-04-07).

---

## Base URL and auth

```
Base URL: https://api.morphllm.com/v1
Auth:     Authorization: Bearer <MORPH_API_KEY>
```

All endpoints are OpenAI-compatible — any OpenAI SDK works with `baseURL` override.

---

## Model IDs

| Model | ID | Purpose | Speed | Accuracy |
|:--|:--|:--|:--|:--|
| Apply (fast) | `morph-v3-fast` | Default file editing | 10,500+ tok/s | 96% |
| Apply (large) | `morph-v3-large` | Complex multi-edit changes | 2,500+ tok/s | 98% |
| Apply (auto) | `auto` | Router picks fast vs large | Variable | ~98% |
| WarpGrep | `morph-warp-grep-v2.1` | Codebase search subagent | ~6s per search | #1 SWE-Bench Pro |
| Compact | `morph-compactor` | Context compression | 33,000 tok/s | Verbatim lines |
| Embedding | `morph-embedding-v4` | Code/text embeddings (1536d) | Fastest in market | SoTA code retrieval |
| Rerank | `morph-rerank-v4` | Search result reranking | Fastest in market | SoTA code benchmarks |
| Router | `morph-routers` | Prompt complexity classifier | ~430ms | — |
| Browser | `morph-computer-use-v1` | Browser automation | 200 tok/s | — |

---

## Products used by pi-fast-apply

### 1. Fast Apply (current — PIM-002)

**Endpoints:**
- `POST /v1/chat/completions` — OpenAI-compat (used by SDK)
- `POST /v1/code/apply` — Direct structured endpoint

**Message format:**
```
<instruction>First-person description of the edit</instruction>
<code>Original file content</code>
<update>Partial edit with // ... existing code ... markers</update>
```

**Key rules:**
- Always set `temperature: 0`
- Always include `<instruction>` — accuracy jumps from 92% to 98%
- `<update>` must use `// ... existing code ...` markers for unchanged regions
- Apply is for edits, not file creation — do not send empty `<code>` blocks
- Make all edits to a file in a single call, not multiple calls

**SDK:**
```typescript
import { applyEdit } from '@morphllm/morphsdk';

const result = await applyEdit(
  { targetFilepath, instructions, codeEdit },
  { morphApiKey, morphApiUrl, timeout, generateUdiff: true }
);
// result.mergedCode, result.usage, result.udiff
```

**Pricing:** Standard Morph API pricing (not separately listed per-model in public docs).

### 2. WarpGrep (PIM-006)

**Endpoint:** `POST /v1/chat/completions` with `model: "morph-warp-grep-v2.1"`

**Built-in tools (do NOT pass a `tools` array):**

| Tool | Purpose | Local implementation |
|:--|:--|:--|
| `grep_search` | Regex search in file contents | `rg --line-number --no-heading --color=never -i -C 1` |
| `read` | Read file with optional line range | `fs.readFile` + line slicing |
| `list_directory` | Explore directory structure | `find` or `ls` |
| `glob` | Find files by pattern, sorted by mtime | Recursive glob matching |
| `finish` | Submit final answer with file:line spans | Parse and read the referenced files |

**Output limits per tool:**

| Tool | Max lines |
|:--|:--|
| `grep_search` | 200 |
| `list_directory` | 200 |
| `read` | 800 |
| `glob` | 100 files |

**Initial message format:**
```xml
<repo_structure>
/absolute/path/to/repo
/absolute/path/to/repo/src
/absolute/path/to/repo/src/auth
/absolute/path/to/repo/package.json
</repo_structure>

<search_string>
Find where user authentication is implemented
</search_string>
```

**Turn counter** — injected as `{role: "user"}` after tool results:
- Turns 1-4: `"You have used N turns and have M remaining"`
- Turn 5: `"You have used 5 turns, you only have 1 turn remaining. You have run out of turns to explore the code base and MUST call the finish tool now"`
- Max 6 turns total

**GitHub search mode:**
```typescript
const result = await morph.warpGrep.searchGitHub({
  searchTerm: 'Find authentication middleware',
  github: 'vercel/next.js',
  branch: 'canary',
});
```

**Pricing:** $0.80 / 1M input + $0.80 / 1M output tokens.

### 3. Compact (PIM-009, PIM-007)

**Endpoints:**
- `POST /v1/compact` — Native Morph format (preferred)
- `POST /v1/chat/completions` with `model: "morph-compactor"` — OpenAI-compat
- `POST /v1/responses` — OpenAI Responses API

**Parameters:**

| Param | Type | Default | Description |
|:--|:--|:--|:--|
| `input` | string or array | — | Text or `{role, content}` messages |
| `query` | string | auto-detected | Focus query for relevance scoring |
| `compression_ratio` | float | 0.5 | Fraction to keep (0.3 aggressive, 0.7 light) |
| `preserve_recent` | int | 2 | Keep last N messages uncompressed |
| `compress_system_messages` | bool | false | Whether to compress system messages |
| `include_line_ranges` | bool | true | Include removed line ranges in response |
| `include_markers` | bool | true | Include `(filtered N lines)` in output |

**`<keepContext>` tags:**
```
<keepContext>
// This section survives compression verbatim
function authenticate(req, res, next) { ... }
</keepContext>
```

Rules: tags on their own line, open and close within same message, unclosed tag preserves to end of message.

**Response shape:**
```json
{
  "output": "compressed text...",
  "messages": [{
    "role": "user",
    "content": "compressed...",
    "compacted_line_ranges": [{ "start": 5, "end": 10 }],
    "kept_line_ranges": [{ "start": 1, "end": 4 }]
  }],
  "usage": {
    "input_tokens": 101,
    "output_tokens": 65,
    "compression_ratio": 0.644,
    "processing_time_ms": 109
  }
}
```

**SDK:**
```typescript
import { MorphClient } from '@morphllm/morphsdk';

const morph = new MorphClient({ apiKey: 'YOUR_API_KEY' });

const result = await morph.compact({
  input: chatHistory,
  query: 'How do I validate JWT tokens?',
  compressionRatio: 0.5,
  preserveRecent: 3,
});

// result.output — compressed text
// result.messages[0].compacted_line_ranges — what was removed
```

### 4. Router (PIM-011)

**Endpoint:** Internal SDK method.

**SDK:**
```typescript
const { model } = await morph.routers.anthropic.selectModel({
  input: userQuery,
  mode: 'balanced',  // or 'aggressive'
});
// Returns: { model: "claude-haiku-4-5-20251001" } or { model: "claude-sonnet-4-5-20250929" }

// Raw classification:
const { difficulty } = await morph.routers.raw.classify({ input: userQuery });
// Returns: { difficulty: "easy" | "medium" | "hard" | "needs_info" }
```

**Provider model maps:**

| Provider | Fast/Cheap | Powerful |
|:--|:--|:--|
| Anthropic | `claude-haiku-4-5-20251001` | `claude-sonnet-4-5-20250929` |
| OpenAI | `gpt-5-mini` | `gpt-5-low`, `gpt-5-medium`, `gpt-5-high` |
| Gemini | `gemini-2.5-flash` | `gemini-2.5-pro` |

**Pricing:** $0.001/request.

---

## Products not used (reference only)

### Embeddings (`morph-embedding-v4`)

```typescript
const response = await openai.embeddings.create({
  model: 'morph-embedding-v4',
  input: 'function calculateSum(a, b) { return a + b; }',
});
// 1536 dimensions, SoTA code retrieval benchmarks
```

### Rerank (`morph-rerank-v4`)

```typescript
const response = await fetch('https://api.morphllm.com/v1/rerank', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'morph-rerank-v4',
    query: 'JWT authentication in Express',
    documents: [...],
    top_n: 5,
  }),
});
// Cohere-client compatible
```

### Report API

```bash
curl -X POST "https://morphllm.com/api/report" \
  -H "Authorization: Bearer $KEY" \
  -d '{ "completion_id": "chatcmpl-...", "failure_reason": "Syntax error in output" }'
```

---

## External links

- [Full docs in one file](https://docs.morphllm.com/llms-full.txt) (~9K tokens distilled, ~18K lines full)
- [SDK npm package](https://www.npmjs.com/package/@morphllm/morphsdk) — `npm install @morphllm/morphsdk`
- [MCP server](https://www.npmjs.com/package/@morphllm/morphmcp) — `npx @morphllm/morphmcp`
- [Examples repo](https://github.com/morphllm/examples) — WarpGrep, agents, integrations
- [API playground](https://morphllm.com/dashboard/playground/apply)
- [Dashboard / API keys](https://morphllm.com/dashboard/api-keys)
