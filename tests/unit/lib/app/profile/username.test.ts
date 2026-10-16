/**
 * Unit Tests: the username rules (`f-profiles` r1), `lib/app/profile/username.ts`.
 *
 * Pins the shape and length, the fold to lower case, the reserved names (this app's own addresses), the look-alikes
 * found after the usual disguises are undone, the blocked words, and that one answer covers all three refusals so the
 * refusal does not teach the list.
 */
import { describe, it, expect } from 'vitest';

import { USERNAME_MESSAGES, usernameProblem, usernameSchema } from '@/lib/app/profile/username';

describe('usernameProblem', () => {
  it.each(['abc', 'moog_fan', 'tape-loop-9', '9volt', 'a'.repeat(24)])('accepts %s', (name) => {
    expect(usernameProblem(name)).toBeNull();
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(25)],
    ['a space', 'moog fan'],
    ['a dot', 'moog.fan'],
    ['a leading underscore', '_moog'],
    ['a leading hyphen', '-moog'],
    ['an accented letter', 'mooğ'],
    ['empty', ''],
  ])('refuses the shape: %s', (_why, name) => {
    expect(usernameProblem(name)).toBe('shape');
  });

  it('reads a name trimmed and folded, so case and surrounding space make no new name', () => {
    expect(usernameProblem('  Moog_Fan  ')).toBeNull();
    expect(usernameProblem('ADMIN')).toBe('unavailable');
  });

  it.each(['bank', 'synths', 'explore', 'tutor', 'settings', 'api', 'knowyoursynth', 'kys', 'you'])(
    'refuses the reserved name %s',
    (name) => {
      expect(usernameProblem(name)).toBe('unavailable');
    }
  );

  it('refuses a reserved name only as itself: kys inside another name is fine', () => {
    expect(usernameProblem('skyscraper')).toBeNull();
  });

  it.each(['4dm1n', 'the_admin', 'know-your-synth-official', 'm0derator99', 'supp0rt-desk'])(
    'refuses the look-alike %s',
    (name) => {
      expect(usernameProblem(name)).toBe('unavailable');
    }
  );

  it.each(['sh1t-synth', 'F_u_c_k', 'bigtwat'])('refuses the blocked word in %s', (name) => {
    expect(usernameProblem(name)).toBe('unavailable');
  });
});

describe('usernameSchema', () => {
  it('carries the name on trimmed and lower-case', () => {
    expect(usernameSchema.parse('  Tape_Loop ')).toBe('tape_loop');
  });

  it('gives one message for a reserved name, a look-alike and a blocked word alike', () => {
    for (const name of ['bank', '4dm1n', 'sh1t-synth']) {
      const result = usernameSchema.safeParse(name);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((i) => i.message)).toEqual([USERNAME_MESSAGES.unavailable]);
    }
  });

  it('names the rule for a name of the wrong shape', () => {
    const result = usernameSchema.safeParse('x');
    expect(result.error?.issues.map((i) => i.message)).toEqual([USERNAME_MESSAGES.shape]);
  });
});
