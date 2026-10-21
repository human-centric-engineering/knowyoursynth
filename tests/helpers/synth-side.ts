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
 * does nothing, so a helper shared by tests at both widths can call it. `Lesson` opens the card where the panel is,
 * from its chapter: the finished sound's card is the overview (how it works, ways to make it yours).
 */
export function openSide(tab: SideTab): void {
  // `hidden`: a modal sheet that is up takes the bottom bar out of the accessibility tree, but it is still there.
  if (screen.queryByRole('navigation', { name: 'Beside the panel', hidden: true })) return;
  if (tab === 'Sounds') {
    const b = screen.getByRole('button', { name: /^Choose a sound/ });
    if (!pressed(b, 'aria-expanded')) fireEvent.click(b);
    return;
  }
  if (tab === 'Lesson') {
    if (screen.queryByTestId('lesson-card')) return;
    const chapters = screen.queryByRole('list', { name: 'Lesson steps' });
    const b = chapters?.querySelector<HTMLElement>('button[aria-current="step"]');
    if (b) fireEvent.click(b);
    return;
  }
  const b = screen.getByRole('button', { name: tab === 'Inspect' ? 'Inspector' : 'Tutor' });
  if (!pressed(b, 'aria-pressed')) fireEvent.click(b);
}

/**
 * The step the panel is at, read from the Sound Design strip's chapters as "step 2 of 3", or `null` with the finished
 * sound on (or no lesson). The last chapter is the finished sound, so it is not counted as a step.
 */
export function stepShown(): string | null {
  const list = screen.queryByRole('list', { name: 'Lesson steps' });
  if (!list) return null;
  const chapters = [...list.querySelectorAll('button')];
  const n = chapters.length - 1;
  const at = chapters.slice(0, n).findIndex((b) => b.getAttribute('aria-current') === 'step');
  return at < 0 ? null : `step ${at + 1} of ${n}`;
}

/**
 * Makes the window a tall screen (1000px), where the dock's piano is out until it is put away. A short one puts it
 * away by default; happy-dom's own window is 768px tall.
 */
export function tallScreen(height = 1000): void {
  (
    window as unknown as { happyDOM: { setViewport(v: { height: number }): void } }
  ).happyDOM.setViewport({
    height,
  });
}
