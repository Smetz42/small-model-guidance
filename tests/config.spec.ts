import { describe, expect, it } from 'vitest';
import { parseGuidanceConfig } from '../src/config.js';

describe('guidance binding configuration', () => {
  it('parses a valid binding with a route pin', () => {
    const cfg = parseGuidanceConfig({ bindings: [{ models: ['qwen3.8-27b'], route: 'gumdrop', text: 'never emit direct tool calls' }] });
    expect(cfg.bindings).toEqual([{ models: ['qwen3.8-27b'], route: 'gumdrop', text: 'never emit direct tool calls' }]);
  });

  it('parses a binding with no route pin, leaving route absent', () => {
    const cfg = parseGuidanceConfig({ bindings: [{ models: ['m1'], text: 't' }] });
    expect(cfg.bindings[0].models).toEqual(['m1']);
    expect(cfg.bindings[0].route).toBeUndefined();
  });

  it('defaults bindings to an empty list', () => {
    expect(parseGuidanceConfig({}).bindings).toEqual([]);
    expect(parseGuidanceConfig({ bindings: [] }).bindings).toEqual([]);
  });

  it('rejects an empty model list, naming the cause', () => {
    expect(() => parseGuidanceConfig({ bindings: [{ models: [], text: 'x' }] })).toThrowError(/models/);
  });

  it('rejects empty text, naming the cause', () => {
    expect(() => parseGuidanceConfig({ bindings: [{ models: ['m'], text: '' }] })).toThrowError(/text/);
  });

  it('rejects wrong shapes', () => {
    expect(() => parseGuidanceConfig({ bindings: [{ models: 'qwen', text: 'x' }] })).toThrowError();
    expect(() => parseGuidanceConfig({ bindings: [{ models: ['m'], text: 3 }] })).toThrowError();
    expect(() => parseGuidanceConfig({ bindings: 'nope' })).toThrowError();
  });
});
