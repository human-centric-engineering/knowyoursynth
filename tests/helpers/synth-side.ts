/**
 * The synth page's drawers beside the player (`f-player` t-70), for page tests at `lg` and up, where only the open
 * drawer's region is in the accessibility tree.
 *
 * @see components/app/synth/drawers.tsx
 */

import { fireEvent, screen, within } from '@testing-library/react';

export type SideTab = 'Sounds' | 'Lesson' | 'Inspect' | 'Tutor';

/**
 * Opens a drawer from its tab, leaving it open if it already is. Below `lg` there are no drawers, only sheets, and it
 * does nothing, so a helper shared by tests at both widths can call it.
 */
export function openSide(tab: SideTab): void {
  const nav = screen.queryByRole('navigation', { name: 'Side panels' });
  if (!nav) return;
  const button = within(nav).getByRole('button', { name: tab });
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
}

/** Opens a drawer before the page renders, as a returning visitor's browser would. */
export function startWithSide(id: 'library' | 'lesson' | 'inspector' | 'tutor'): void {
  window.localStorage.setItem('kys.side', JSON.stringify(id));
}
