/**
 * Bundle the faceplate's static renderer for a shared sound's social card (t-50).
 *
 *   components/app/sharing/panel-render-entry.tsx → components/app/sharing/generated/panel-render.mjs
 *
 * The card is drawn by an App Router route, where `SynthPanel` (a `'use client'` module) cannot be called and
 * `react-dom/server` cannot be imported. Bundled stand-alone, with its own copy of React, it is plain code the route
 * imports (`panel-render.ts`). The `'use client'` directives are dropped by bundling, as they should be: nothing here
 * runs in a browser.
 *
 * Runs before `npm run dev` and `npm run build` (the `predev` / `prebuild` scripts). The output is a build product and
 * is gitignored; its type is the committed `panel-render.d.mts`.
 *
 * Usage:
 *   npx tsx scripts/build-panel-renderer.ts
 *
 * Printing goes through `console`, not `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */

import { build } from 'esbuild';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const ENTRY = 'components/app/sharing/panel-render-entry.tsx';
const OUT = 'components/app/sharing/generated/panel-render.mjs';

/** Writes the bundle; with `write: false`, returns its code instead (what the tests check). */
export async function bundlePanelRenderer({ write = true } = {}): Promise<string> {
  const outfile = join(ROOT, OUT);
  const result = await build({
    entryPoints: [join(ROOT, ENTRY)],
    outfile,
    write,
    bundle: true,
    minify: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    jsx: 'automatic',
    legalComments: 'none',
    // React's production build: the card is never a development aid.
    define: { 'process.env.NODE_ENV': '"production"' },
    // `@/…` resolves through tsconfig.json's `paths`, which esbuild reads from the project root.
    tsconfig: join(ROOT, 'tsconfig.json'),
    // "Module level directives cause errors when bundled": the `'use client'` lines, dropped on purpose.
    logOverride: { 'module-level-directive': 'silent' },
    logLevel: 'warning',
  });
  if (write) console.log(`panel renderer: ${ENTRY} → ${relative(ROOT, outfile)}`);
  return result.outputFiles?.[0]?.text ?? '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  bundlePanelRenderer().catch((err: unknown) => {
    console.error('build-panel-renderer failed:', err);
    process.exit(1);
  });
