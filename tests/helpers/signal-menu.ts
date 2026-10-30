/**
 * The Signal layer on the panel's top rail (`f-live-panel` t-150), for page tests: what it is set to, and choosing a
 * mode from its menu. In use is what "Dim unused parts" was.
 *
 * Found by their labels with a selector rather than by role: the synth page is large, and a role query over all of it
 * takes seconds in happy-dom.
 *
 * @see components/app/synth/player-tools.tsx
 */

import { fireEvent } from '@testing-library/react';

export type SignalName = 'Off' | 'In use' | 'Live';

const LABEL = 'Signal on the panel';

function trigger(): HTMLButtonElement {
  const b = document.querySelector<HTMLButtonElement>(`button[aria-label="${LABEL}"]`);
  if (!b) throw new Error('no Signal control on the page');
  return b;
}

/** Opens the menu and chooses `name`. */
export function chooseSignal(name: SignalName): void {
  fireEvent.click(trigger());
  const menu = document.querySelector(`[role="group"][aria-label="${LABEL}"]`);
  const option = [...(menu?.querySelectorAll('button') ?? [])].find(
    (b) => b.querySelector('.kys-signal-name')?.textContent === name
  );
  if (!option) throw new Error(`no ${name} in the Signal menu`);
  fireEvent.click(option);
}

/** The mode the trigger says it is set to. */
export function signalShown(): SignalName {
  const m = /Signal: (In use|Live)/.exec(trigger().textContent ?? '');
  return m ? (m[1] === 'Live' ? 'Live' : 'In use') : 'Off';
}
