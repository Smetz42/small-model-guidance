import { expect, it } from 'vitest';
import * as plugin from '../src/index.js';

it('exports the function-plugin contract surface', () => {
  expect(plugin.name).toBe('small-model-guidance');
  expect(plugin.Config).toBeTypeOf('function'); // schemastery schemas are callable validators
  expect(plugin.apply).toBeTypeOf('function');
  expect(plugin.createPreStepHandler).toBeTypeOf('function');
  expect(plugin.createAgentCreatedHandler).toBeTypeOf('function');
});
