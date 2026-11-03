/**
 * A library sound left on the synth page's panel, for page tests. A synth chosen over another (or opened for the first
 * time) opens on the Default patch (`f-default-patch`), so a test of what a library sound brings (its lesson, riff,
 * patterns or restore) comes back to one left there instead, as a refresh does: the session the page stores, with the
 * sound as it came, and the synth as the last one opened.
 *
 * @see components/app/synth/storage.ts
 */

import type { Preset, SynthDef } from '@/lib/app/synths/contract';
import { presetState } from '@/lib/app/synths/lib/patch';

/** Mark `synthId` as the last synth opened, so the page comes back to it rather than switching to it. */
export function comeBackTo(synthId: string): void {
  window.localStorage.setItem('kys.synth', JSON.stringify(synthId));
}

/** Store `sound` on `def`'s panel as it came, as the page does once it has been still for the write delay. */
export function storeSound(def: SynthDef, sound: Pick<Preset, 'id' | 'steps' | 'phrase'>): void {
  comeBackTo(def.id);
  window.localStorage.setItem(
    `kys.session.${def.id}`,
    JSON.stringify({ presetId: sound.id, step: null, soundId: null, ...presetState(def, sound) })
  );
}
