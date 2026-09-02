import { expect, it } from 'vitest';
import { PLUGIN_ID } from '../src/index.js';

it('resolves the ESM entry and exposes the plugin id used by the bundle patch', () => {
  expect(PLUGIN_ID).toBe('small-model-guidance');
});
