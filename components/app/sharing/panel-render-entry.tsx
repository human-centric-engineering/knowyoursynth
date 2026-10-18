import { renderToStaticMarkup } from 'react-dom/server.browser';

import { SynthPanel } from '@/components/app/panel/synth-panel';
import type { SynthPanelProps } from '@/components/app/panel/synth-panel';

/**
 * The faceplate as static SVG markup: the entry point `scripts/build-panel-renderer.ts` bundles into
 * `components/app/sharing/generated/panel-render.mjs`, for a shared sound's social card (t-50).
 *
 * Why a bundle. The card is drawn by an App Router route (`opengraph-image.tsx`). There, `SynthPanel` (a `'use client'`
 * module) is only a reference the server cannot call, and `react-dom/server` is refused. Bundled stand-alone, with its
 * own copy of React, the faceplate is plain code the route can run. Import it through `panel-render.ts`, never directly.
 *
 * React's browser server build, not its Node one: the same `renderToStaticMarkup`, without the Node built-ins
 * (`async_hooks`, `stream`, …) the Node build `require`s at run time, which the route's bundler refuses.
 */
export function renderPanel(props: SynthPanelProps): string {
  return renderToStaticMarkup(<SynthPanel {...props} />);
}
