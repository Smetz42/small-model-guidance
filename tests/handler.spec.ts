import { describe, expect, it } from 'vitest';
import { createAgentCreatedHandler, createPreStepHandler, GUIDANCE_ORDER } from '../src/index.js';
import type { GuidanceBinding } from '../src/config.js';

interface FakeAgent {
  options: { provider?: string; model?: string };
  ctx: {
    systemPrompt: {
      section(section: { name: string; order: number; text: string }): () => void;
    };
  };
}

function fakeAgent(provider?: string, model?: string): { agent: FakeAgent; sections: { name: string; order: number; text: string }[] } {
  const sections: { name: string; order: number; text: string }[] = [];
  const service = {
    section(section: { name: string; order: number; text: string }) {
      sections.push(section);
      return () => {
        const i = sections.indexOf(section);
        if (i >= 0) sections.splice(i, 1);
      };
    },
  };
  const agent: FakeAgent = {
    options: { provider, model },
    ctx: {
      get(key: string) {
        return key === 'systemPrompt' ? service : undefined;
      },
    },
  };
  return { agent, sections };
}

const bindings: GuidanceBinding[] = [{ models: ['qwen3.8-27b'], text: 'GUIDANCE' }];
const decision = { kind: 'enter' as const, messages: [] };
const next = async () => decision;
const step = async (handler: ReturnType<typeof createPreStepHandler>, agent: FakeAgent): Promise<void> => {
  await handler({ agent }, next);
};

describe('pre-step guidance handler', () => {
  it('registers the section for a matching agent at the guidance order', async () => {
    const { agent, sections } = fakeAgent('gumdrop', 'qwen3.8-27b');
    await step(createPreStepHandler(bindings), agent);
    expect(sections).toEqual([{ name: 'small-model-guidance', order: GUIDANCE_ORDER, text: 'GUIDANCE' }]);
  });

  it('registers nothing for a non-matching agent', async () => {
    const { agent, sections } = fakeAgent('gumdrop', 'deepseek-chat');
    await step(createPreStepHandler(bindings), agent);
    expect(sections).toEqual([]);
  });

  it('keeps one section across repeated steps without duplicate registration', async () => {
    const { agent, sections } = fakeAgent('gumdrop', 'qwen3.8-27b');
    const handler = createPreStepHandler(bindings);
    await step(handler, agent);
    await step(handler, agent);
    expect(sections).toHaveLength(1);
  });

  it('replaces the section when the model switches', async () => {
    const { agent, sections } = fakeAgent('gumdrop', 'qwen3.8-27b');
    const handler = createPreStepHandler([
      { models: ['qwen3.8-27b'], text: 'OLD' },
      { models: ['deepseek-chat'], text: 'NEW' },
    ]);
    await step(handler, agent);
    agent.options.model = 'deepseek-chat';
    await step(handler, agent);
    expect(sections).toEqual([{ name: 'small-model-guidance', order: GUIDANCE_ORDER, text: 'NEW' }]);
  });

  it('disposes the section when the agent stops matching', async () => {
    const { agent, sections } = fakeAgent('gumdrop', 'qwen3.8-27b');
    const handler = createPreStepHandler(bindings);
    await step(handler, agent);
    agent.options.model = 'deepseek-chat';
    await step(handler, agent);
    expect(sections).toEqual([]);
  });

  it('passes the downstream decision through unchanged', async () => {
    const { agent } = fakeAgent('gumdrop', 'qwen3.8-27b');
    const result = await createPreStepHandler(bindings)({ agent }, next);
    expect(result).toBe(decision);
  });
});

describe('agent/created guidance handler', () => {
  it('registers the section at creation for a matching agent', () => {
    const { agent, sections } = fakeAgent('gumdrop', 'qwen3.8-27b');
    createAgentCreatedHandler(bindings)({ agent });
    expect(sections).toEqual([{ name: 'small-model-guidance', order: GUIDANCE_ORDER, text: 'GUIDANCE' }]);
  });

  it('registers nothing at creation for a non-matching agent', () => {
    const { agent, sections } = fakeAgent('gumdrop', 'deepseek-chat');
    createAgentCreatedHandler(bindings)({ agent });
    expect(sections).toEqual([]);
  });

  it('registers nothing when provider or model identity is missing', () => {
    const identities = [[undefined, 'qwen3.8-27b'], ['gumdrop', undefined], [undefined, undefined]] as const;
    for (const [provider, model] of identities) {
      const { agent, sections } = fakeAgent(provider, model);
      createAgentCreatedHandler(bindings)({ agent });
      expect(sections).toEqual([]);
    }
  });

  it('does not duplicate the created registration when the listeners share bookkeeping', async () => {
    const { agent, sections } = fakeAgent('gumdrop', 'qwen3.8-27b');
    const registered = new WeakMap();
    createAgentCreatedHandler(bindings, registered)({ agent });
    await step(createPreStepHandler(bindings, registered), agent);
    expect(sections).toHaveLength(1);
  });
});
