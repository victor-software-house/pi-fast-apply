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

Pi extensions can intercept tool results via the `PostToolUse` lifecycle event or by wrapping tool output in a custom `renderResult` function. The compact interception should:

1. Fire after any tool that produces large text output (read, grep, warp_grep, bash)
2. NOT fire for tools that produce structured/small output (edit, write, ls)
3. Be transparent — the model sees the compressed result as if it were the original

## Query derivation

The `query` parameter is critical for compression quality. Without it, Compact auto-detects from the last user message, which is often good enough. But explicit is better.

**Priority chain:**
1. If the model's current tool call has an `instruction` or `explanation` param → use that
2. If the user's last message is available → use the first 500 chars
3. Fallback → omit `query`, let Compact auto-detect

## `<keepContext>` strategy

Certain content should never be compressed:

- **System prompt** — already excluded by `compress_system_messages: false`
- **Recent messages** — protected by `preserve_recent: 3`
- **Active file being edited** — if a tool reads a file the model is about to edit, mark it with `<keepContext>` tags

For Pi, the extension can wrap the last N tool results in `<keepContext>` if they were explicitly requested by the model (not background context).

## Configuration

| Env var | Default | Description |
|:--|:--|:--|
| `MORPH_COMPACT_THRESHOLD` | `2000` | Minimum token count to trigger compression (estimated at ~4 chars/token) |
| `MORPH_COMPACT_RATIO` | `0.5` | Compression ratio (0.3 = aggressive, 0.7 = light) |
| `MORPH_COMPACT_PRESERVE_RECENT` | `3` | Messages to keep uncompressed |
| `MORPH_COMPACT_ENABLED` | `true` | Master switch |

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

const morph = new MorphClient({ apiKey: process.env.MORPH_API_KEY });

const THRESHOLD_CHARS = parsePositiveInt(
  process.env['MORPH_COMPACT_THRESHOLD'], 8000  // ~2K tokens
);
const RATIO = parseFloat(process.env['MORPH_COMPACT_RATIO'] ?? '0.5');
const PRESERVE_RECENT = parsePositiveInt(
  process.env['MORPH_COMPACT_PRESERVE_RECENT'], 3
);

async function compactToolResult(
  toolOutput: string,
  query: string | undefined
): Promise<{ output: string; compressed: boolean; stats?: CompactStats }> {
  // Skip if below threshold
  if (toolOutput.length < THRESHOLD_CHARS) {
    return { output: toolOutput, compressed: false };
  }

  // Skip if no API key
  const apiKey = await resolveMorphApiKey();
  if (!apiKey) {
    return { output: toolOutput, compressed: false };
  }

  const result = await morph.compact({
    input: toolOutput,
    query,
    compressionRatio: RATIO,
    preserveRecent: 0,  // tool results are a single block, not messages
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
```

## Operator-visible output

When compression fires, show a diagnostic line in the Pi TUI:

```
Compact: 12,450 → 4,890 tokens (60.7% reduction, 0.8s) — query: "JWT validation"
```

## Interaction with PIM-007 (lifecycle hook)

PIM-009 is the *implicit* compaction path — automatic on every large tool result.
PIM-007 is the *explicit* compaction path — triggered by the operator via `/compact`.

They use the same Morph Compact API but fire at different points:
- PIM-009: `PostToolUse` event, per-result, high frequency, low latency
- PIM-007: `PreCompact` event, whole conversation, low frequency, higher latency acceptable

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
