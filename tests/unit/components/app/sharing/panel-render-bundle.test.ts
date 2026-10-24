/**
 * The social card's panel renderer bundle (t-50), built as `predev` / `prebuild` build it, in memory.
 *
 * - It holds no `require`: the card's App Router route is bundled by Next, which refuses a dynamic `require` at run
 *   time ("dynamic usage of require is not supported"). React's Node server build brings four (`async_hooks`,
 *   `crypto`, `stream`, `util`), which is why the entry uses its browser one; this is what catches a switch back.
 * - It runs on its own and draws the faceplate: loaded from a file, as the route loads it, it renders Model D's SVG.
 * - The command line writes that same code to the file it is given, and says where.
 *
 * @see scripts/build-panel-renderer.ts
 * @see components/app/sharing/panel-render-entry.tsx
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { renderPanel as RenderPanel } from '@/components/app/sharing/panel-render-entry';
import { getSynthDef } from '@/lib/app/synths/defs';
import { bundlePanelRenderer, writePanelRenderer } from '@/scripts/build-panel-renderer';

let code: string;
beforeAll(async () => {
  code = await bundlePanelRenderer();
}, 60_000);

/** A fresh temporary directory, removed when the file's tests are done. */
const made: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'kys-panel-render-'));
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the panel renderer bundle', () => {
  it('holds no require, which the route’s bundler refuses', () => {
    expect(code.length).toBeGreaterThan(0);
    // Each `require` with a little of the code around it, rather than the whole bundle when one turns up.
    expect(code.match(/.{0,60}\brequire\b.{0,60}/g) ?? []).toEqual([]);
  });

  it('draws the faceplate when loaded on its own', async () => {
    const file = join(tempDir(), 'panel-render.mjs');
    writeFileSync(file, code);
    const { renderPanel } = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as {
      renderPanel: typeof RenderPanel;
    };
    const def = getSynthDef('model-d')!;
    const noop = () => undefined;
    const markup = renderPanel({
      def,
      values: def.init,
      cables: [],
      design: 'neutral',
      onChange: noop,
      onConnect: noop,
      onRemoveCable: noop,
    });
    expect(markup.startsWith('<svg')).toBe(true);
    // The front panel only: the view leaves out the end cheeks.
    expect(markup).toContain(`viewBox="40 0 ${def.view.w - 80} ${def.view.h}"`);
  });

  it('is written, as built, to the file it is given', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const file = join(tempDir(), 'nested', 'panel-render.mjs');
    await writePanelRenderer(file);
    expect(readFileSync(file, 'utf8')).toBe(code);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('panel-render-entry.tsx →'));
  }, 60_000);
});
