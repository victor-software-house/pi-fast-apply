# PIM-009: Real-time Compact Interception — Design Doc

## Problem

Tool results (file reads, grep output, search contexts) often contain thousands of irrelevant lines that consume the main LLM's context window. A 500-line file read to change 3 lines wastes ~497 lines of context. Over a multi-turn session, this accumulates into context bloat that degrades reasoning quality and increases cost.

## Solution

Intercept large tool results *before* they enter the conversation history and compress them with Morph Compact. The user's current task becomes the `query` parameter, so compression is intelligent — relevant lines survive verbatim, irrelevant lines are dropped.

## Architecture

```
Tool executes (read, grep, etc.)
        |
        v
  Tool result text
        |
        v
  Size check: > THRESHOLD?
   /            \
  no             yes
  |               |
  v               v
pass through   Compact API call
  |             query = user's last message
  |             compression_ratio = configurable
  |               |
  v               v
conversation    compressed result
  history       (every surviving line
                 is byte-identical)
                    |
                    v
              conversation history
              + operator diagnostic
```

## Interception point

Pi 0.74 exposes two relevant extension hooks:

- `pi.on("tool_result", ...)` — per-tool-result interception; return `{ content, details, isError }` to rewrite what enters model context.
- `pi.on("session_before_compact", ...)` — manual/session compaction customization; return `{ compaction }` to replace Pi's default summary.

Real-time Compact interception belongs in `tool_result`, not in a renderer. `renderResult()` only changes operator display; it does not reduce model-facing context.

The compact interception should:

1. Fire after any tool that produces large text output (`read`, `grep`, selected `bash`, future `warp_grep`).
2. NOT fire for tools that produce structured/small output (`edit`, `write`, `ls`, `fast_apply`).
3. Be transparent — the model sees the compressed result as if it were the original.

## Query derivation

The `query` parameter is critical for compression quality. Without it, Compact auto-detects from the last user message, which is often good enough. But explicit is better.

**Priority chain:**
1. If the model's current tool call has an `instruction` or `explanation` param → use that
2. If the user's last message is available → use the first 500 chars
3. Fallback → omit `query`, let Compact auto-detect

## `<keepContext>` strategy

Certain content should never be compressed:

- **System prompt** — already excluded by `compress_system_messages: false` for message-based compaction.
- **Recent messages** — protected by `preserve_recent: 3` for session compaction.
- **Active file being edited** — if a tool reads a file the model is about to edit, mark it with `<keepContext>` tags or skip per-result compaction for that read.

For Pi per-tool-result compaction, be conservative at first: prefer skipping active edit-target reads over trying to infer all critical spans. Compact is line-deletion, not summarization; it cannot trim within giant single-line payloads, so minified JSON/base64-like lines are poor candidates. Before compacting JSON or other structured payloads, test pretty-formatting first so important fields are spread across lines.

## Configuration

| Env var | Default | Description |
|:--|:--|:--|
| `MORPH_COMPACT_THRESHOLD` | `2000` | Minimum token count to trigger compression (estimated at ~4 chars/token) |
| `MORPH_COMPACT_RATIO` | `0.5` | Compression ratio (0.3 = aggressive, 0.7 = light) |
| `MORPH_COMPACT_PRESERVE_RECENT` | `3` | Messages to keep uncompressed |
| `MORPH_COMPACT_ENABLED` | `false` for automatic `tool_result`, explicit for session compaction | Master switch |

## Latency budget

Compact runs at 33,000 tok/s:

| Input size | Compression time |
|:--|:--|
| 10K tokens | ~0.3s |
| 50K tokens | ~1.5s |
| 100K tokens | ~2s |
| 200K tokens | ~3-4s |

For typical tool results (5-50K tokens), latency is 0.3-1.5 seconds — well within acceptable bounds since the alternative is the main LLM processing all those tokens at much higher cost and lower speed.

## Implementation sketch

```typescript
import { MorphClient } from '@morphllm/morphsdk';

const THRESHOLD_CHARS = parsePositiveInt(
  process.env['MORPH_COMPACT_THRESHOLD'],
  8000, // ~2K tokens
);
const RATIO = Number.parseFloat(process.env['MORPH_COMPACT_RATIO'] ?? '0.5');

async function compactToolResult(
  toolOutput: string,
  query: string | undefined,
  apiKey: string,
): Promise<{ output: string; compressed: boolean; stats?: CompactStats }> {
  if (toolOutput.length < THRESHOLD_CHARS) {
    return { output: toolOutput, compressed: false };
  }

  const morph = new MorphClient({ apiKey });
  const result = await morph.compact({
    input: toolOutput,
    query,
    compressionRatio: RATIO,
    preserveRecent: 0, // tool results are a single block, not messages
    includeMarkers: true,
    includeLineRanges: true,
  });

  return {
    output: result.output,
    compressed: true,
    stats: {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      ratio: result.usage.compression_ratio,
      timeMs: result.usage.processing_time_ms,
      linesRemoved: result.messages[0]?.compacted_line_ranges?.length ?? 0,
    },
  };
}

pi.on('tool_result', async (event) => {
  if (event.isError || !shouldCompactTool(event.toolName)) return;
  const originalText = extractTextContent(event.content);
  if (!originalText) return;

  const compacted = await compactToolResult(originalText, currentTaskQuery, apiKey);
  if (!compacted.compressed) return;

  return {
    content: [{ type: 'text', text: compacted.output }],
    details: {
      ...(event.details ?? {}),
      morphCompact: compacted.stats,
    },
  };
});
```

## Operator-visible output

When compression fires, show a diagnostic line in the Pi TUI:

```
Compact: 12,450 → 4,890 tokens (60.7% reduction, 0.8s) — query: "JWT validation"
```

## Rollout relationship with explicit compaction

Automatic `tool_result` compaction is the *implicit* path — automatic on large tool results after experiments prove quality.
Explicit compaction is the safer first path — integrated with Pi's existing `session_before_compact` lifecycle.

They use the same Morph Compact API but fire at different points:
- automatic result compaction: `tool_result` event, per-result, high frequency, low latency, default off until validated
- explicit session compaction: `session_before_compact` event, whole conversation, low frequency, higher latency acceptable

Before enabling automatic result compaction, run experiments on:

1. raw file excerpts returned by `codebase_search`
2. pretty-formatted JSON vs compact single-line JSON
3. Markdown/code-fenced excerpts
4. queries derived from the current user task vs tool-call instruction text
5. frozen-block reuse for repeated compaction, inspired by the OpenCode Morph plugin's cache-stable compaction strategy

## Risks and mitigations

| Risk | Mitigation |
|:--|:--|
| Compact drops a critical line | `<keepContext>` for active edit targets; `preserve_recent` for recent messages |
| Latency adds up on many tool calls | Only fire above threshold; batch if Pi supports it |
| Query derivation picks wrong focus | Use model's own tool-call instruction text when available |
| API cost | $0.80/1M input + $0.80/1M output — far cheaper than the main LLM processing the full context |

## References

- [Compact SDK docs](https://docs.morphllm.com/sdk/components/compact)
- [Compact API endpoint](https://docs.morphllm.com/api-reference/endpoint/compact)
- [Morph Compact FAQ](https://docs.morphllm.com/sdk/components/compact#faq) — "How is this different from summarization?" → "Every sentence that survives is character-for-character identical. No drift, no hallucinated context."
