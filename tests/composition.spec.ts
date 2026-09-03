import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import * as smallModelGuidance from '../src/index.js';
import { BASELINE_TEXT } from '../src/config.js';
import { ScriptedAdapter, textResponse } from './scripted-adapter.js';

const GUIDANCE_TEXT = 'Never emit a tool-call block as message text; issue tool calls only through the run_code program channel.';

/** Flatten one message's content blocks to text; non-text blocks contribute nothing. */
function blocksText(content: unknown): string {
  if (Array.isArray(content)) {
    return content
      .map(block => (block && typeof block === 'object' && 'text' in block ? String((block as { text: unknown }).text) : ''))
      .join('');
  }
  return typeof content === 'string' ? content : '';
}

function rendered(request: { system?: string; messages: { content: unknown }[] }): string {
  return [request.system ?? '', ...request.messages.map(message => blocksText(message.content))].join('\n');
}

async function boot(adapter: ScriptedAdapter): Promise<Context> {
  const ctx = new Context();
  await ctx.plugin(LlmRuntime);
  await ctx.plugin(SessionStore);
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(smallModelGuidance, { bindings: [{ models: ['qwen3.8-27b'], text: GUIDANCE_TEXT }] });
  await ctx.plugin(AgentLoop, { agents: [] });
  ctx.llm.registerAdapter(['mock'], adapter);
  return ctx;
}

describe('small-model-guidance composition', () => {
  it('contributes the guidance section to a matching agent and keeps it stable across turns', async () => {
    const adapter = new ScriptedAdapter([textResponse('one'), textResponse('two')]);
    const ctx = await boot(adapter);
    try {
      const agentLoop = ctx.get('agentLoop') as InstanceType<typeof AgentLoop>;
      const agent = agentLoop.create(SessionId('smg-tracer'), { provider: 'mock', model: 'qwen3.8-27b' }, { cwd: process.cwd() });

      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'turn one' }], source: { kind: 'user' } }));
      await agent.whenIdle();
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'turn two' }], source: { kind: 'user' } }));
      await agent.whenIdle();

      expect(adapter.requests).toHaveLength(2);
      for (const request of adapter.requests) {
        const text = rendered(request);
        expect(text).toContain(GUIDANCE_TEXT);
        expect(text.split(GUIDANCE_TEXT)).toHaveLength(2);
      }
      expect(adapter.requests.map(request => rendered(request))).toMatchSnapshot();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('contributes nothing for a non-matching model', async () => {
    const adapter = new ScriptedAdapter([textResponse('nope')]);
    const ctx = await boot(adapter);
    try {
      const agentLoop = ctx.get('agentLoop') as InstanceType<typeof AgentLoop>;
      const agent = agentLoop.create(SessionId('smg-other'), { provider: 'mock', model: 'deepseek-chat' }, { cwd: process.cwd() });

      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } }));
      await agent.whenIdle();

      expect(adapter.requests).toHaveLength(1);
      expect(rendered(adapter.requests[0])).not.toContain(GUIDANCE_TEXT);
      expect(rendered(adapter.requests[0])).toMatchSnapshot();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('replaces the section on the next pre-step after a mid-session model switch', async () => {
    const adapter = new ScriptedAdapter([textResponse('a'), textResponse('b'), textResponse('c')]);
    const ctx = new Context();
    await ctx.plugin(LlmRuntime);
    await ctx.plugin(SessionStore);
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(AgentRegistry);
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(smallModelGuidance, {
      bindings: [
        { models: ['qwen3.8-27b'], text: 'OLD_GUIDANCE' },
        { models: ['deepseek-chat'], text: 'NEW_GUIDANCE' },
      ],
    });
    await ctx.plugin(AgentLoop, { agents: [] });
    ctx.llm.registerAdapter(['mock'], adapter);
    try {
      const agentLoop = ctx.get('agentLoop') as InstanceType<typeof AgentLoop>;
      const agent = agentLoop.create(SessionId('smg-switch'), { provider: 'mock', model: 'qwen3.8-27b' }, { cwd: process.cwd() });

      const run = async (text: string): Promise<void> => {
        agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
        await agent.whenIdle();
      };

      await run('turn one');
      // Switch the identity the plugin conditions on.
      agent.options.model = 'deepseek-chat';
      await run('turn two');
      await run('turn three');

      expect(adapter.requests).toHaveLength(3);
      // Prompt assembly precedes the pre-step waterfall, so the step that
      // notices the switch still carries the previous section; the following
      // step carries the replacement.
      expect(rendered(adapter.requests[0])).toContain('OLD_GUIDANCE');
      expect(rendered(adapter.requests[1])).toContain('OLD_GUIDANCE');
      expect(rendered(adapter.requests[2])).toContain('NEW_GUIDANCE');
      expect(rendered(adapter.requests[2])).not.toContain('OLD_GUIDANCE');
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('injects all matching bindings in listed order and collapses identical text', async () => {
    const adapter = new ScriptedAdapter([textResponse('multi')]);
    const ctx = new Context();
    await ctx.plugin(LlmRuntime);
    await ctx.plugin(SessionStore);
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(AgentRegistry);
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(smallModelGuidance, {
      bindings: [
        { models: ['qwen3.8-27b'], text: 'MULTI_ONE' },
        { models: ['qwen3.8-27b'], text: 'MULTI_TWO' },
        { models: ['qwen3.8-27b'], text: 'MULTI_ONE' },
      ],
    });
    await ctx.plugin(AgentLoop, { agents: [] });
    ctx.llm.registerAdapter(['mock'], adapter);
    try {
      const agentLoop = ctx.get('agentLoop') as InstanceType<typeof AgentLoop>;
      const agent = agentLoop.create(SessionId('smg-multi'), { provider: 'mock', model: 'qwen3.8-27b' }, { cwd: process.cwd() });

      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }));
      await agent.whenIdle();

      expect(adapter.requests).toHaveLength(1);
      const prompt = rendered(adapter.requests[0]);
      expect(prompt.indexOf('MULTI_ONE')).toBeGreaterThanOrEqual(0);
      expect(prompt.indexOf('MULTI_TWO')).toBeGreaterThan(prompt.indexOf('MULTI_ONE'));
      expect(prompt.split('MULTI_ONE')).toHaveLength(2); // collapsed: exactly one occurrence
      expect(prompt).toMatchSnapshot();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('injects the baseline for a zero-config install and pins it verbatim', async () => {
    const adapter = new ScriptedAdapter([textResponse('base')]);
    const ctx = new Context();
    await ctx.plugin(LlmRuntime);
    await ctx.plugin(SessionStore);
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(AgentRegistry);
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(smallModelGuidance, {});
    await ctx.plugin(AgentLoop, { agents: [] });
    ctx.llm.registerAdapter(['mock'], adapter);
    try {
      const agentLoop = ctx.get('agentLoop') as InstanceType<typeof AgentLoop>;
      const agent = agentLoop.create(SessionId('smg-baseline'), { provider: 'mock', model: 'qwen3.8-27b' }, { cwd: process.cwd() });

      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }));
      await agent.whenIdle();

      expect(adapter.requests).toHaveLength(1);
      const prompt = rendered(adapter.requests[0]);
      expect(prompt).toContain(BASELINE_TEXT);
      expect(prompt.split(BASELINE_TEXT)).toHaveLength(2);
      expect(prompt).toMatchSnapshot();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('drops the baseline on includeBaseline: false while user bindings keep working', async () => {
    const adapter = new ScriptedAdapter([textResponse('user')]);
    const ctx = new Context();
    await ctx.plugin(LlmRuntime);
    await ctx.plugin(SessionStore);
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(AgentRegistry);
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(smallModelGuidance, { includeBaseline: false, bindings: [{ models: ['qwen3.8-27b'], text: 'USER_GUIDANCE' }] });
    await ctx.plugin(AgentLoop, { agents: [] });
    ctx.llm.registerAdapter(['mock'], adapter);
    try {
      const agentLoop = ctx.get('agentLoop') as InstanceType<typeof AgentLoop>;
      const agent = agentLoop.create(SessionId('smg-nobaseline'), { provider: 'mock', model: 'qwen3.8-27b' }, { cwd: process.cwd() });

      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }));
      await agent.whenIdle();

      expect(adapter.requests).toHaveLength(1);
      const prompt = rendered(adapter.requests[0]);
      expect(prompt).toContain('USER_GUIDANCE');
      expect(prompt).not.toContain(BASELINE_TEXT);
      expect(prompt).toMatchSnapshot();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('orders the baseline before user bindings and collapses a copied baseline', async () => {
    const adapter = new ScriptedAdapter([textResponse('order')]);
    const ctx = new Context();
    await ctx.plugin(LlmRuntime);
    await ctx.plugin(SessionStore);
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(AgentRegistry);
    await ctx.plugin(ToolRuntime);
    await ctx.plugin(smallModelGuidance, {
      bindings: [{ models: ['qwen3.8-27b'], text: BASELINE_TEXT }],
    });
    await ctx.plugin(AgentLoop, { agents: [] });
    ctx.llm.registerAdapter(['mock'], adapter);
    try {
      const agentLoop = ctx.get('agentLoop') as InstanceType<typeof AgentLoop>;
      const agent = agentLoop.create(SessionId('smg-copy'), { provider: 'mock', model: 'qwen3.8-27b' }, { cwd: process.cwd() });

      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }));
      await agent.whenIdle();

      expect(adapter.requests).toHaveLength(1);
      const prompt = rendered(adapter.requests[0]);
      // Copying the baseline text into a user binding must not double-inject.
      expect(prompt.split(BASELINE_TEXT)).toHaveLength(2);
      expect(prompt).toMatchSnapshot();
    } finally {
      await ctx.fiber.dispose();
    }
  });
});
