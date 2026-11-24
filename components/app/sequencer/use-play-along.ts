'use client';

/**
 * How closely the hand rides the wheel along with a pattern (`f-performance-wheels` t-311): while play-along is on and
 * the pattern plays, the hand's wheels are compared with the ghost a few times a second, and the sign under the wheels
 * says how it is going (`play-along.ts`). A step whose wheel lanes set nothing has no ghost, and is not counted.
 */
import { useEffect, useRef, useState } from 'react';
import type { ControlValues } from '@/lib/app/synths/contract';
import { shownBend, shownWheel } from '@/lib/app/synths/lib/performance';
import {
  NO_FOLLOW,
  closeness,
  follow,
  followSign,
  type Follow,
  type FollowSign,
} from '@/lib/app/sequencer/play-along';

/** How often the hand is compared with the ghost. */
export const FOLLOW_SAMPLE_MS = 100;

/** The mod wheel's travel (0..1) and the pitch wheel's (-1..1). */
const WHEEL_SPAN = 1;
const BEND_SPAN = 2;

export function usePlayAlong({
  on,
  ghost,
  wheel,
  bend,
  run,
}: {
  /** Play-along is on and the pattern plays. */
  on: boolean;
  /** What the wheel lanes set on the step being heard. */
  ghost: ControlValues | null;
  /** The hand's wheels. */
  wheel: number;
  bend: number;
  /** What is being played along with: another pattern opened mid-run starts the score again. */
  run?: unknown;
}): FollowSign | null {
  const [sign, setSign] = useState<FollowSign | null>(null);
  const now = useRef({ ghost, wheel, bend });
  useEffect(() => {
    now.current = { ghost, wheel, bend };
  }, [ghost, wheel, bend]);

  useEffect(() => {
    setSign(null);
    if (!on) return undefined;
    let f: Follow = NO_FOLLOW;
    let said = '';
    const id = setInterval(() => {
      const { ghost: g, wheel: w, bend: b } = now.current;
      const gw = shownWheel(g);
      const gb = shownBend(g);
      const parts: number[] = [];
      if (gw !== undefined) parts.push(closeness(w, gw, WHEEL_SPAN));
      if (gb !== undefined) parts.push(closeness(b, gb, BEND_SPAN));
      if (parts.length === 0) return;
      f = follow(f, parts.reduce((x, y) => x + y, 0) / parts.length);
      const next = followSign(f);
      const key = next?.level ?? '';
      if (key === said) return;
      said = key;
      setSign(next);
    }, FOLLOW_SAMPLE_MS);
    return () => clearInterval(id);
  }, [on, run]);

  return sign;
}
