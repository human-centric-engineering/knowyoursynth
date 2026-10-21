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
import type { ReactNode } from 'react';

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
  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Content side={side} sideOffset={8} collisionPadding={12} className="kys-tip">
          <span className="kys-tip-name">{name}</span>
          {help && <span className="kys-tip-help">{help}</span>}
          <Tooltip.Arrow className="kys-tip-arrow" width={12} height={6} />
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
