import { z } from 'zod';

import { normaliseForCheck, usernameIsBlocked } from '@/lib/app/profile/words';

/**
 * The rules for a username (`f-profiles` r1): the one place they are written.
 *
 * 3–24 characters: letters, digits, `-` and `_`, starting with a letter or a digit. Stored lower-case, so `Moog_Fan` and
 * `moog_fan` are the same name and the second person to try is told it is taken. The name is what a user's public
 * page (`/u/<username>`) and, later, their published sounds go under; the account name and email never do.
 *
 * BeatBreaker's rules are the precedent. Its shape and limits carry over because the reason does (a URL segment a
 * person types); the reserved names are this app's own addresses and words.
 *
 * Pure and synchronous: the settings form and the API run the same schema.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
/** How often a username may change, and how long a given-up one is held. */
export const USERNAME_CHANGE_DAYS = 30;
export const USERNAME_HOLD_DAYS = 30;

export const USERNAME_RULE = `${USERNAME_MIN}–${USERNAME_MAX} letters, numbers, - or _`;

const SHAPE = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Names nobody may take: the site's own addresses (a top-level route, or one a user's page could be mistaken for),
 * its roles, and words that would read as speaking for Know Your Synth. Nothing shorter than {@link USERNAME_MIN}: the
 * shape refuses those first (`u`, `me`). `kys` is here as itself, not as a look-alike:
 * it is a common abbreviation of something nobody should be called, and as a substring it would refuse innocent names.
 */
const RESERVED = new Set([
  'about',
  'account',
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'bank',
  'contact',
  'dashboard',
  'databank',
  'everyone',
  'explore',
  'help',
  'home',
  'knowyoursynth',
  'kys',
  'login',
  'logout',
  'mod',
  'moderator',
  'null',
  'official',
  'privacy',
  'profile',
  'root',
  'settings',
  'signup',
  'sounds',
  'staff',
  'support',
  'synth',
  'synths',
  'system',
  'team',
  'terms',
  'tutor',
  'undefined',
  'you',
]);

/**
 * Roles someone could impersonate by spelling them differently: `4dm1n`, `the_admin`, `know-your-synth-official`.
 * Checked after the disguises are undone, and anywhere in the name.
 */
const LOOK_ALIKES = ['admin', 'knowyoursynth', 'moderator', 'official', 'support'].map(
  normaliseForCheck
);

export type UsernameProblem = 'shape' | 'unavailable';

/**
 * What is wrong with a username before asking the database whether it is taken: `shape` (the characters or the
 * length), `unavailable` (reserved, a look-alike or a blocked word: one answer for all three, so the refusal does not
 * teach anyone the list), or null.
 */
export function usernameProblem(raw: string): UsernameProblem | null {
  const name = raw.trim().toLowerCase();
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX || !SHAPE.test(name)) return 'shape';
  if (RESERVED.has(name)) return 'unavailable';
  const flat = normaliseForCheck(name);
  if (LOOK_ALIKES.some((w) => flat.includes(w))) return 'unavailable';
  if (usernameIsBlocked(name)) return 'unavailable';
  return null;
}

export const USERNAME_MESSAGES = {
  shape: `Use ${USERNAME_RULE}, starting with a letter or number.`,
  unavailable: "That username isn't available.",
  taken: "That one's taken. Try another.",
} as const;

/** A username as a request carries it: trimmed, folded, and held to the rules. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((name, ctx) => {
    const problem = usernameProblem(name);
    if (problem) ctx.addIssue({ code: 'custom', message: USERNAME_MESSAGES[problem] });
  });
