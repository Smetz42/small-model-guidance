import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The bundle manifest wiring the DSH Loader: package.json points at the patch, and the patch mounts this plugin. */
describe('bundle manifest', () => {
  it('wires the patch into the package and mounts the plugin id', () => {
    const manifest = JSON.parse(readFileSync(`${root}package.json`, 'utf8')) as { dsh?: { bundle?: { patch?: string } } };
    const patchPath = manifest.dsh?.bundle?.patch;
    expect(patchPath).toBe('./cordis.patch.yml');

    const patch = readFileSync(`${root}${patchPath}`, 'utf8');
    expect(patch).toContain('id: small-model-guidance');
    expect(patch).toContain("name: 'small-model-guidance'");
  });
});
