/**
 * A library sound left on the synth page's panel, for page tests. A first visit opens on the Default patch
 * (`f-default-patch`), so a test of what a library sound brings (its lesson, riff, patterns or restore) comes back to one
 * left there instead: the session the page stores, with the sound as it came.
 *
 * @see components/app/synth/storage.ts
 */

import type { Preset, SynthDef } from '@/lib/app/synths/contract';
import { presetState } from '@/lib/app/synths/lib/patch';

/** Store `sound` on `def`'s panel as it came, as the page does once it has been still for the write delay. */
export function storeSound(def: SynthDef, sound: Pick<Preset, 'id' | 'steps' | 'phrase'>): void {
  window.localStorage.setItem(
    `kys.session.${def.id}`,
    JSON.stringify({ presetId: sound.id, step: null, soundId: null, ...presetState(def, sound) })
  );
}
