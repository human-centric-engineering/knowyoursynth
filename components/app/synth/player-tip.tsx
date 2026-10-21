'use client';

/**
 * The player's tooltip (`f-player`): a button's name, and a line on what it does, shown on hover or keyboard focus,
 * as a video player names its controls. It replaces the browser's own `title` on the player's buttons, which is slow
 * to come and cannot be styled.
 *
 * Not portalled, so it opens inside the player and comes with it into full screen. Nothing that
 * holds it may carry a `transform` (see `synth.css`), so its fixed positioning escapes the bar's scroller.
 */

import * as Tooltip from '@radix-ui/react-tooltip';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const SHARED = createContext(false);

/**
 * One provider for the tips inside it, so moving from one button to the next opens the next tip at once, as a video
 * player's do: Radix skips the delay only between tips under the same provider. A tip outside one brings its own.
 */
export function PlayerTips({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={400}>
      <SHARED.Provider value>{children}</SHARED.Provider>
    </Tooltip.Provider>
  );
}

export function PlayerTip({
  name,
  help,
  side = 'top',
  children,
}: {
  /** What the button is, in a word or two. */
  name: string;
  /** What it does, where the name does not say. */
  help?: string;
  side?: 'top' | 'bottom';
  /** The button: one element that takes a ref, which the tip hangs from. */
  children: ReactNode;
}) {
  const shared = useContext(SHARED);
  const tip = (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Content side={side} sideOffset={8} collisionPadding={12} className="kys-tip">
        <span className="kys-tip-name">{name}</span>
        {help && <span className="kys-tip-help">{help}</span>}
        <Tooltip.Arrow className="kys-tip-arrow" width={12} height={6} />
      </Tooltip.Content>
    </Tooltip.Root>
  );
  return shared ? tip : <PlayerTips>{tip}</PlayerTips>;
}
