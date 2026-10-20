/**
 * What opens over the synth page's panel from `lg` up (`f-player` t-74), for page tests: the sounds from the Sound
 * Design strip's picker, the inspector and the tutor from the player bar, and the lesson card from the strip. Only
 * what is open is in the accessibility tree.
 *
 * @see components/app/synth/synth-page.tsx
 */

import { fireEvent, screen } from '@testing-library/react';

export type SideTab = 'Sounds' | 'Lesson' | 'Inspect' | 'Tutor';

const pressed = (b: HTMLElement, attr: 'aria-expanded' | 'aria-pressed') =>
  b.getAttribute(attr) === 'true';

/**
 * Opens one, leaving it open if it already is. Below `lg` these are sheets opened from the bottom bar instead, and it
 * does nothing, so a helper shared by tests at both widths can call it. `Lesson` opens the card at How it works.
 */
export function openSide(tab: SideTab): void {
  if (screen.queryByRole('navigation', { name: 'Beside the panel' })) return;
  if (tab === 'Sounds') {
    const b = screen.getByRole('button', { name: /^Choose a sound/ });
    if (!pressed(b, 'aria-expanded')) fireEvent.click(b);
    return;
  }
  if (tab === 'Lesson') {
    const b = screen.queryByRole('button', { name: 'How it works' });
    if (b && !pressed(b, 'aria-pressed')) fireEvent.click(b);
    return;
  }
  const b = screen.getByRole('button', { name: tab === 'Inspect' ? 'Inspector' : 'Tutor' });
  if (!pressed(b, 'aria-pressed')) fireEvent.click(b);
}
