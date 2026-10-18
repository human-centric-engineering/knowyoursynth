/**
 * The social card's panel renderer bundle (t-50), built as `predev` / `prebuild` build it, in memory.
 *
 * - It holds no `require`: the card's App Router route is bundled by Next, which refuses a dynamic `require` at run
 *   time ("dynamic usage of require is not supported"). React's Node server build brings four (`async_hooks`,
 *   `crypto`, `stream`, `util`), which is why the entry uses its browser one; this is what catches a switch back.
 * - It runs on its own and draws the faceplate: loaded from a file, as the route loads it, it renders Model D's SVG.
 *
 * @see scripts/build-panel-renderer.ts
 * @see components/app/sharing/panel-render-entry.tsx
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import type { renderPanel as RenderPanel } from '@/components/app/sharing/panel-render-entry';
import { getSynthDef } from '@/lib/app/synths/defs';
import { bundlePanelRenderer } from '@/scripts/build-panel-renderer';

let code: string;
beforeAll(async () => {
  code = await bundlePanelRenderer({ write: false });
}, 60_000);

describe('the panel renderer bundle', () => {
  it('holds no require, which the route’s bundler refuses', () => {
    expect(code.length).toBeGreaterThan(0);
    // Each `require` with a little of the code around it, rather than the whole bundle when one turns up.
    expect(code.match(/.{0,60}\brequire\b.{0,60}/g) ?? []).toEqual([]);
  });

  it('draws the faceplate when loaded on its own', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'kys-panel-render-')), 'panel-render.mjs');
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
    expect(markup).toContain(`viewBox="0 0 ${def.view.w} ${def.view.h}"`);
  });
});
