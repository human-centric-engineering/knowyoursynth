/**
 * Flow, the Signal layer on the panel's top rail (`f-live-panel` t-150, t-279), for page tests: what it is set to,
 * and choosing a mode from the menu behind its caret. Path is what "Dim unused parts" (then "In use") was.
 *
 * Found by their labels with a selector rather than by role: the synth page is large, and a role query over all of it
 * takes seconds in happy-dom.
 *
 * @see components/app/synth/player-tools.tsx
 */

import { fireEvent } from '@testing-library/react';

export type SignalName = 'Off' | 'Path' | 'Live' | 'Live + lines';

const LABEL = 'Signal flow';
const CARET = 'Ways to show the signal flow';

function trigger(): HTMLButtonElement {
  const b = document.querySelector<HTMLButtonElement>(`button[aria-label^="${LABEL}:"]`);
  if (!b) throw new Error('no Flow control on the page');
  return b;
}

function caret(): HTMLButtonElement {
  const b = document.querySelector<HTMLButtonElement>(`button[aria-label="${CARET}"]`);
  if (!b) throw new Error('no Flow caret on the page');
  return b;
}

/** Opens the menu and chooses `name`. */
export function chooseSignal(name: SignalName): void {
  fireEvent.click(caret());
  const menu = document.querySelector(`[role="group"][aria-label="${LABEL}"]`);
  const option = [...(menu?.querySelectorAll('button') ?? [])].find(
    (b) => b.querySelector('.kys-signal-name')?.textContent === name
  );
  if (!option) throw new Error(`no ${name} in the Flow menu`);
  fireEvent.click(option);
}

/** The mode the trigger says it is set to. */
export function signalShown(): SignalName {
  const m = /Flow: (Path|Live \+ lines|Live)/.exec(trigger().textContent ?? '');
  return m ? (m[1] === 'Path' ? 'Path' : m[1] === 'Live' ? 'Live' : 'Live + lines') : 'Off';
}
