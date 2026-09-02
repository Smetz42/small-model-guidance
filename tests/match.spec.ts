import { describe, expect, it } from 'vitest';
import { matchesBinding } from '../src/match.js';
import type { GuidanceBinding } from '../src/config.js';

const binding = (over: Partial<GuidanceBinding> = {}): GuidanceBinding => ({
  models: ['qwen3.8-27b'],
  text: 'guidance',
  ...over,
});

describe('guidance binding matching', () => {
  it('matches a listed model with no route pin, on any provider', () => {
    expect(matchesBinding(binding(), 'gumdrop', 'qwen3.8-27b')).toBe(true);
    expect(matchesBinding(binding(), 'other-route', 'qwen3.8-27b')).toBe(true);
  });

  it('does not match an unlisted model', () => {
    expect(matchesBinding(binding(), 'gumdrop', 'deepseek-chat')).toBe(false);
  });

  it('matches one text against every listed model id', () => {
    expect(matchesBinding(binding({ models: ['a', 'b'] }), 'r', 'a')).toBe(true);
    expect(matchesBinding(binding({ models: ['a', 'b'] }), 'r', 'b')).toBe(true);
    expect(matchesBinding(binding({ models: ['a', 'b'] }), 'r', 'c')).toBe(false);
  });

  it('honors a route pin only for the pinned provider', () => {
    expect(matchesBinding(binding({ route: 'gumdrop' }), 'gumdrop', 'qwen3.8-27b')).toBe(true);
    expect(matchesBinding(binding({ route: 'gumdrop' }), 'other', 'qwen3.8-27b')).toBe(false);
  });

  it('treats missing identity as non-matching', () => {
    expect(matchesBinding(binding(), undefined, 'qwen3.8-27b')).toBe(false);
    expect(matchesBinding(binding(), 'gumdrop', undefined)).toBe(false);
    expect(matchesBinding(binding({ route: 'gumdrop' }), undefined, 'qwen3.8-27b')).toBe(false);
  });
});
