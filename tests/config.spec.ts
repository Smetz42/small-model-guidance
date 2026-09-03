import { describe, expect, it } from 'vitest';
import { BASELINE_BINDING, BASELINE_TEXT, parseGuidanceConfig, resolveBindings } from '../src/config.js';

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

describe('baseline binding', () => {
  it('defaults includeBaseline to true and orders the baseline before operator bindings', () => {
    const cfg = parseGuidanceConfig({ bindings: [{ models: ['qwen3.8-27b'], text: 'USER' }] });
    expect(cfg.includeBaseline).toBe(true);
    const resolved = resolveBindings(cfg);
    expect(resolved[0]).toEqual({ models: ['qwen3.8-27b'], text: BASELINE_TEXT });
    expect(resolved[1]).toEqual({ models: ['qwen3.8-27b'], text: 'USER' });
  });

  it('ships the baseline without a route pin', () => {
    expect(BASELINE_BINDING.route).toBeUndefined();
    expect(BASELINE_BINDING.models).toEqual(['qwen3.8-27b']);
  });

  it('drops the baseline on includeBaseline: false while keeping operator bindings', () => {
    const cfg = parseGuidanceConfig({ includeBaseline: false, bindings: [{ models: ['m1'], text: 'USER' }] });
    expect(resolveBindings(cfg)).toEqual([{ models: ['m1'], text: 'USER' }]);
  });

  it('keeps explicit includeBaseline: true', () => {
    const cfg = parseGuidanceConfig({ includeBaseline: true, bindings: [] });
    expect(resolveBindings(cfg)).toEqual([BASELINE_BINDING]);
  });

  it('pins the baseline text to the captured prompt-block elements', () => {
    const phrases = [
      'silently dead turn',
      'lossless JSON',
      'try/catch',
      'require a description argument in their args',
      'missing required property "description"',
      'curate output',
      're-issue the identical work once as a run_code program',
      'await tools.<name>(args)',
    ];
    for (const phrase of phrases) expect(BASELINE_TEXT).toContain(phrase);
    expect(BASELINE_TEXT).not.toContain('gumdrop');
    expect(BASELINE_TEXT).not.toContain('ninfer');
  });
});
