import { describe, expect, it } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import { unknownRoutePins, apply } from '../src/index.js';
import type { GuidanceBinding } from '../src/config.js';

/** Minimal structural Context double: service reads, listeners, and a capturing logger. */
function fakeCtx(llm: unknown): { ctx: Context; warns: string[]; createdListeners: (() => void)[] } {
  const warns: string[] = [];
  const createdListeners: (() => void)[] = [];
  const ctx = {
    get(key: string) {
      return key === 'llm' ? llm : undefined;
    },
    logger: {
      warn(message: string) {
        warns.push(message);
      },
    },
    on(event: string, handler: (payload?: unknown) => void) {
      if (event === 'agent/created') createdListeners.push(() => handler({ agent: { options: {} } }));
      return () => undefined;
    },
  } as unknown as Context;
  return { ctx, warns, createdListeners };
}

const llmSurface = (routes: string[]) => ({
  listProviders: () => routes.map(id => ({ id })),
  listConfigurableProviders: () => [],
});

describe('hardening: unresolvable route pins surface, not silently miss', () => {
  it('reports pins that no known provider route serves, with the binding index', () => {
    const bindings: GuidanceBinding[] = [
      { models: ['m1'], route: 'known', text: 'a' },
      { models: ['m2'], text: 'b' },
      { models: ['m3'], route: 'ghost', text: 'c' },
    ];
    expect(unknownRoutePins(bindings, new Set(['known']))).toEqual([{ index: 2, route: 'ghost' }]);
  });

  it('reports nothing when every pin is known', () => {
    const bindings: GuidanceBinding[] = [{ models: ['m1'], route: 'known', text: 'a' }];
    expect(unknownRoutePins(bindings, new Set(['known']))).toEqual([]);
  });

  it('warns at load when a pin matches no registered route', () => {
    const { ctx, warns } = fakeCtx(llmSurface(['other']));
    apply(ctx, { bindings: [{ models: ['m1'], route: 'gumdrop', text: 't' }] });
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('bindings[0]');
    expect(warns[0]).toContain('gumdrop');
  });

  it('stays silent when the pin matches a configurable provider route', () => {
    const { ctx, warns } = fakeCtx({
      listProviders: () => [],
      listConfigurableProviders: () => [{ provider: 'gumdrop' }],
    });
    apply(ctx, { bindings: [{ models: ['m1'], route: 'gumdrop', text: 't' }] });
    expect(warns).toEqual([]);
  });

  it('defers the check to the first agent creation when the llm registry is not up at load', () => {
    const { ctx, warns, createdListeners } = fakeCtx(undefined);
    apply(ctx, { bindings: [{ models: ['m1'], route: 'gumdrop', text: 't' }] });
    expect(warns).toEqual([]);
    // The registry comes up before agents exist.
    (ctx as unknown as { get(key: string): unknown }).get = () => llmSurface(['other']);
    for (const listener of createdListeners) listener();
    expect(warns).toHaveLength(1);
    expect(warns[0]).toContain('gumdrop');
  });

  it('fails loud at load for malformed bindings, before any listener registers', () => {
    const { ctx, warns, createdListeners } = fakeCtx(undefined);
    expect(() => apply(ctx, { bindings: [{ models: [], text: 't' }] })).toThrowError(/models/);
    expect(createdListeners).toHaveLength(0);
    expect(warns).toEqual([]);
  });
});
