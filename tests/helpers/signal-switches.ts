/**
 * Signal's switches on the panel's top rail (`f-live-panel` t-150, t-279), for page tests: Dim unused parts (once
 * the Signal menu's "In use") and Live signal, each a toggle of its own, and whether each is on.
 *
 * Found by their labels with a selector rather than by role: the synth page is large, and a role query over all of it
 * takes seconds in happy-dom.
 *
 * @see components/app/synth/synth-page.tsx
 */

import { fireEvent } from '@testing-library/react';

export type SignalSwitch = 'Dim unused parts' | 'Live signal';

function toggle(name: SignalSwitch): HTMLButtonElement {
  const b = document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!b) throw new Error(`no ${name} switch on the page`);
  return b;
}

/** Whether `name` is on. */
export function signalOn(name: SignalSwitch): boolean {
  return toggle(name).getAttribute('aria-pressed') === 'true';
}

/** Turns `name` on or off, pressing it only if it is not already so. */
export function turnSignal(name: SignalSwitch, on: boolean): void {
  if (signalOn(name) !== on) fireEvent.click(toggle(name));
}
