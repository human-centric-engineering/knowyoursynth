/**
 * Unit Tests: the word check (`f-profiles` r1), `lib/app/profile/words.ts`.
 *
 * Pins that the usual disguises are undone before the check, that a username is checked as one run of characters,
 * so a blocked word is found anywhere in it, and that free text is checked word by word: a blocked word with a usual
 * ending, or spelled out with separators or spaces, is caught, and a word that only starts the same way is not.
 */
import { describe, it, expect } from 'vitest';

import { normaliseForCheck, textIsBlocked, usernameIsBlocked } from '@/lib/app/profile/words';

describe('normaliseForCheck', () => {
  it.each([
    ['F_u-c.k', 'fuck'],
    ['4dm1n', 'admin'],
    ['5h1t', 'shit'],
    ['8a7', 'bat'],
    ['m0d 3', 'mode'],
  ])('reads %s as %s', (raw, flat) => {
    expect(normaliseForCheck(raw)).toBe(flat);
  });
});

describe('usernameIsBlocked', () => {
  it.each(['sh1t-synth', 'bigtwat', 'w4nker99', 'F_u_c_k'])('blocks %s', (name) => {
    expect(usernameIsBlocked(name)).toBe(true);
  });

  it.each(['moog_fan', 'tape-loops', 'shift-register', 'analogue'])('lets %s through', (name) => {
    expect(usernameIsBlocked(name)).toBe(false);
  });

  it('still finds a word whose own letters the disguise map would change', () => {
    // l → i would turn "slut" into "siut" if the list were not normalised the same way
    expect(usernameIsBlocked('slut')).toBe(true);
  });
});

describe('textIsBlocked', () => {
  it.each([
    'Sh1t bass',
    'a fucking bass',
    'shitty pad',
    'f.u.c.k',
    's-h-i-t bass',
    'bass.shit',
    'f u c k this',
    'S L U T',
  ])('blocks %s', (text) => {
    expect(textIsBlocked(text)).toBe(true);
  });

  it.each([
    'Scunthorpe bass',
    'shitake mushroom pad',
    'flame retardant pad',
    'a b c d',
    'shift-register lead',
    'Night bass',
  ])('lets %s through', (text) => {
    expect(textIsBlocked(text)).toBe(false);
  });
});
