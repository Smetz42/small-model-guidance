import { CallId, LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';

/** Minimal text response with the exact chunk shapes the loop assembles. */
export function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ];
}

/**
 * Scripted adapter: each model call consumes the next entry and records the
 * request. Mirrors the harness MockAdapter's contract (resolveModel + stream)
 * with only the surface the guidance tests need.
 */
export class ScriptedAdapter extends LlmAdapter {
  requests: GenerateOptions[] = [];

  constructor(private script: StreamChunk[][]) {
    super();
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model });
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const chunks = this.script.shift();
    if (!chunks) throw new Error('ScriptedAdapter: script exhausted');
    for (const chunk of chunks) yield chunk;
  }
}

export { CallId };
