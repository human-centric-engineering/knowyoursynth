/**
 * What the synth page sends the audio engine, for the page tests that fake the engine: the parameters it last sent,
 * and the parameters it should send for a sound, built the way the page builds them.
 *
 * @see components/app/synth/synth-page.tsx
 */

import type { Mock } from 'vitest';
import type { CatalogueSound } from '@/lib/app/catalogue/read';
import type { SynthDef } from '@/lib/app/synths/contract';
import { cablesToEngine, presetState } from '@/lib/app/synths/lib/patch';

/** The parameters last sent to the engine through `send`: what the panel sounds like now. */
export const lastParams = (send: Mock) => {
  const sent = send.mock.calls
    .map((c) => c[0] as { type: string; p?: Record<string, unknown> })
    .filter((m) => m.type === 'params');
  return sent[sent.length - 1]?.p;
};

/** What the engine should be sent for a sound as far as `upto`, as the page builds it. */
export const expectedParams = (def: SynthDef, p: CatalogueSound, upto?: number) => {
  const { values, cables } = presetState(def, p, upto);
  const patched = Object.fromEntries(
    cables.flatMap((c) => [
      [c.to, true],
      [c.from, true],
    ])
  );
  const want = def.toEngine(values, { wheel: 0, patched });
  want.cables = cablesToEngine(def, cables, values);
  want.wheel = 0;
  return want;
};
