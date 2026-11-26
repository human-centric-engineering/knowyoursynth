/**
 * The panel the version toggle carries from one family member to the next (`f-synth-families` t-320).
 *
 * The synth page is keyed by synth, so switching member mounts a new page and the last one's state goes with the old
 * one. The toggle translates the panel before it navigates (`translate()`, which needs both definitions loaded, so it
 * is done where the old one is at hand) and leaves the result here, keyed by the member it goes to. The new page
 * reads it on arrival and lays it over its own Default patch.
 *
 * Module state rather than the URL or storage: a client navigation keeps the module, and what is carried is meant for
 * the one arrival it was made for. A full reload, or a page opened in a new tab, starts afresh as any arrival does.
 * Whatever is left behind (a navigation that never landed) is discarded: a carry is taken only by the member it was
 * made for, and only within `CARRY_TTL_MS` of being made. Taking it clears it, whoever takes it.
 */
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';
import type { Changed, Dropped } from '@/lib/app/synths/families/translate';
import { logger } from '@/lib/logging';

/**
 * How long a carry waits for the page it was made for, in ms. Past it, it is stale. It counts the server render behind
 * the navigation too, so it is generous: what it guards against is a navigation that never landed, not a slow one.
 */
export const CARRY_TTL_MS = 60_000;

export interface FamilyCarry {
  /** The synth ids it was carried from and to. */
  from: string;
  to: string;
  /** The name of the synth it came from, for the note. */
  fromName: string;
  values: ControlValues;
  cables: CablePair[];
  dropped: Dropped[];
  changed: Changed[];
  at: number;
}

let pending: FamilyCarry | null = null;

/** Leave a carry for the member `carry.to`, replacing any other. */
export function leaveCarry(carry: Omit<FamilyCarry, 'at'>): void {
  pending = { ...carry, at: Date.now() };
}

/**
 * Take the carry made for `to`, if it is fresh, and clear whatever was waiting. The page takes it once, in its arrival
 * effect, and holds it in a ref: React's development remount runs that effect again, and must find it still there.
 */
export function takeCarry(to: string): FamilyCarry | null {
  const carry = pending;
  pending = null;
  if (!carry || carry.to !== to) return null;
  const age = Date.now() - carry.at;
  if (age <= CARRY_TTL_MS) return carry;
  logger.warn('synth page: a carried panel arrived too late and was dropped', {
    from: carry.from,
    to,
    ageMs: age,
  });
  return null;
}
