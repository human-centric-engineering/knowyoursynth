/**
 * The player's colour roles in a faceplate's colours (t-201): every synth's face, and the outline drawing's paper, gets
 * text, an accent and module colours that stand off it.
 *
 * @see components/app/synth/face-roles.ts
 */

import { describe, it, expect } from 'vitest';
import {
  BODY_CONTRAST,
  MIN_CONTRAST,
  contrast,
  faceRoles,
  mix,
} from '@/components/app/synth/face-roles';
import { INK, PAPER } from '@/components/app/panel/parts';
import { MODULES } from '@/lib/app/synths/lib/modules';
import { SYNTH_DEFS } from '@/lib/app/synths/defs';

/** Every face the strip can be drawn on: each synth's, and the outline drawing's. */
const FACES: [string, string, string, string][] = [
  ...SYNTH_DEFS.map((d): [string, string, string, string] => [
    d.id,
    d.theme.panel,
    d.theme.panel2 || d.theme.panel,
    d.theme.ink,
  ]),
  ['outline', PAPER, PAPER, INK],
];

describe('mix and contrast', () => {
  it('mixes as CSS color-mix in srgb does', () => {
    expect(mix('#ffffff', 0.5, '#000000')).toBe('#808080');
    expect(mix('#ff0000', 1, '#0000ff')).toBe('#ff0000');
    expect(mix('#f00', 0, '#00f')).toBe('#0000ff');
  });

  it('measures WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});

describe('faceRoles', () => {
  it('keeps the player amber on a black face', () => {
    const r = faceRoles('#1b1c1e', '#121314', '#ecebe6');
    expect(r['--kys-surface']).toBe('#1b1c1e');
    expect(r['--kys-stage']).toBe('#121314');
    expect(r['--kys-text']).toBe('#ecebe6');
    expect(r['--kys-accent']).toBe('#f6a63a');
    expect(r['--kys-accent-ink']).toBe('#1b1204');
    expect(r['--kys-wash']).toBe('236 235 230');
    expect(r['--kys-module-mix']).toBe('100%');
  });

  it('takes the day amber on the outline drawing, with white on it', () => {
    const r = faceRoles(PAPER, PAPER, INK);
    expect(r['--kys-accent']).toBe('#b85f06');
    expect(r['--kys-accent-ink']).toBe('#ffffff');
    expect(r['--kys-wash']).toBe('28 37 48');
  });

  it('falls back to the ink where no amber stands off the face, with the face on it', () => {
    // A yellow face (TD-3): neither amber is 3:1 off it.
    const r = faceRoles('#f2b21c', '#e3a40f', '#2b2213');
    expect(r['--kys-accent']).toBe('#2b2213');
    expect(r['--kys-accent-ink']).toBe('#f2b21c');
  });

  it('leaves the roles to the player for a colour that is not hex', () => {
    expect(faceRoles('pink noise', '#000000', '#ffffff')).toEqual({});
    expect(faceRoles('#000000', '#000000', 'pink noise')).toEqual({});
  });

  it('ends the gradient on the face where its shade is not hex', () => {
    expect(faceRoles('#1b1c1e', '', '#ecebe6')['--kys-stage']).toBe('#1b1c1e');
  });

  it.each(FACES)('stands everything off the %s face', (_id, face, face2, ink) => {
    const r = faceRoles(face, face2, ink);
    const off = (k: '--kys-text' | '--kys-muted' | '--kys-faint' | '--kys-accent') =>
      contrast(r[k] ?? '', face);
    // As far as the print itself, where even that is not as far as wanted (a red face's white print is 5:1).
    const print = contrast(ink, face);
    expect(off('--kys-text')).toBe(print);
    expect(off('--kys-muted')).toBeGreaterThanOrEqual(Math.min(BODY_CONTRAST, print));
    expect(off('--kys-faint')).toBeGreaterThanOrEqual(Math.min(MIN_CONTRAST, print));
    expect(off('--kys-accent')).toBeGreaterThanOrEqual(Math.min(MIN_CONTRAST, print));
    expect(contrast(r['--kys-accent-ink'] ?? '', r['--kys-accent'] ?? '')).toBeGreaterThanOrEqual(
      Math.min(MIN_CONTRAST, print)
    );
    // Each module's colour as the CSS mixes it: `color-mix(in srgb, module p, ink)`.
    const p = Number.parseInt(r['--kys-module-mix'] ?? '', 10) / 100;
    for (const m of Object.values(MODULES)) {
      expect(contrast(mix(m.color, p, ink), face)).toBeGreaterThanOrEqual(
        Math.min(MIN_CONTRAST, print)
      );
    }
    for (const k of ['--kys-good', '--kys-warn'] as const) {
      expect(contrast(r[k] ?? '', face)).toBeGreaterThanOrEqual(Math.min(MIN_CONTRAST, print));
    }
  });
});
