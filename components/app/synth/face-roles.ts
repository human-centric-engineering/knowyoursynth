/**
 * The player's colour roles redrawn in a faceplate's colours, for the pieces of the player that are drawn as part of
 * the instrument rather than on the stage: the Sound Design strip and the lesson card (t-201). The rails along the
 * panel's head and foot are the faceplate's already (`--rail-*`, set by the page); these take the same three colours,
 * the face, its darker shade and the silkscreen ink, or the outline drawing's paper and ink.
 *
 * Every `--kys-*` role those pieces read is redeclared, so what is inside them (the chapters, the step buttons, the
 * card's lists) reads the faceplate's colours as it would the stage's. The text is the ink, and the quieter text the
 * ink mixed toward the face. The accent is the player's amber where it stands off the face, the day amber where that
 * does, and the ink where neither does (a yellow or a red face).
 */

import type { CSSProperties } from 'react';
import { MODULES } from '@/lib/app/synths/lib/modules';
import { luminance } from '@/lib/app/synths/lib/patch';

/** The player's accent on the dark stage, then on the light one: the first that stands off the face is used. */
const ACCENTS = ['#f6a63a', '#b85f06'] as const;
/** The ink on the accent: dark on the amber, white on a darker accent. */
const ON_ACCENT = ['#1b1204', '#ffffff'] as const;
/** The player's green (a finished lesson) and red-orange, by night then by day. */
const GOODS = ['#7ed267', '#2f8a1d'] as const;
const WARNS = ['#ff7d54', '#c2451f'] as const;
/** How far an accent, the faint text and a module's colour must stand off the face (WCAG's, for large text). */
export const MIN_CONTRAST = 3;
/** How far the muted text must, as body text (WCAG's AA). */
export const BODY_CONTRAST = 4.5;

/** The roles a faceplate redeclares. */
export type FaceRole =
  | '--kys-surface'
  | '--kys-raised'
  | '--kys-stage'
  | '--kys-stage-hi'
  | '--kys-line'
  | '--kys-text'
  | '--kys-muted'
  | '--kys-faint'
  | '--kys-accent'
  | '--kys-accent-ink'
  | '--kys-good'
  | '--kys-warn'
  | '--kys-wash'
  | '--kys-module-mix';

/** A `#rgb` / `#rrggbb` colour as its three channels, 0–255; null for anything else. */
function channels(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const at = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [at(0), at(2), at(4)];
}

/** `p` (0–1) of `a` and the rest `b`, as CSS's `color-mix(in srgb, a p, b)`; `a` where either is not hex. */
export function mix(a: string, p: number, b: string): string {
  const ca = channels(a);
  const cb = channels(b);
  if (!ca || !cb) return a;
  return `#${ca
    .map((v, i) => Math.round(v * p + cb[i] * (1 - p)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** WCAG's contrast ratio between two colours, 1 to 21; 1 for a colour that cannot be read. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return 1;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The first of a role's colours that stands off the face, or the ink where none does. */
const first = (colours: readonly string[], face: string, ink: string): string =>
  colours.find((a) => contrast(a, face) >= MIN_CONTRAST) ?? ink;

/** The accent for a face, and the ink drawn on it: the face itself, where the accent is the ink. */
function accentFor(face: string, ink: string): { accent: string; on: string } {
  const accent = first(ACCENTS, face, ink);
  const on =
    accent === ink
      ? face
      : ON_ACCENT.reduce((x, y) => (contrast(y, accent) > contrast(x, accent) ? y : x));
  return { accent, on };
}

/**
 * The ink mixed toward the face, `p` of the ink at least, more where that does not stand `target` off the face: as far
 * as the ink itself, where even that does not (a red face's white print is 5:1).
 */
function quieter(ink: string, face: string, p: number, target: number): string {
  const want = Math.min(target, contrast(ink, face));
  for (let q = p; q < 1; q += 0.02) {
    const c = mix(ink, q, face);
    if (contrast(c, face) >= want) return c;
  }
  return ink;
}

/**
 * How much of a module's own colour the steps and the card's module names keep, the rest the ink, as a percentage:
 * as much as leaves every module's colour `MIN_CONTRAST` off the face (all of it on a black face, less on a cream one).
 */
function moduleMix(face: string, ink: string): number {
  const colours = [...new Set(Object.values(MODULES).map((m) => m.color))];
  const want = Math.min(MIN_CONTRAST, contrast(ink, face));
  for (let p = 100; p > 0; p -= 5) {
    if (colours.every((c) => contrast(mix(c, p / 100, ink), face) >= want)) return p;
  }
  return 0;
}

/**
 * The `--kys-*` roles in a faceplate's colours. `face2` is the darker shade the strip's gradient ends on. A colour
 * that is not hex leaves the roles to the player's (an empty style).
 */
export function faceRoles(
  face: string,
  face2: string,
  ink: string
): CSSProperties & Partial<Record<FaceRole, string>> {
  const c = channels(ink);
  if (!c || !channels(face)) return {};
  const shade = channels(face2) ? face2 : face;
  const { accent, on } = accentFor(face, ink);
  return {
    '--kys-surface': face,
    '--kys-raised': mix(ink, 0.1, face),
    '--kys-stage-hi': face,
    '--kys-stage': shade,
    '--kys-line': mix(ink, 0.28, face),
    '--kys-text': ink,
    '--kys-muted': quieter(ink, face, 0.8, BODY_CONTRAST),
    '--kys-faint': quieter(ink, face, 0.64, MIN_CONTRAST),
    '--kys-accent': accent,
    '--kys-accent-ink': on,
    '--kys-good': first(GOODS, face, ink),
    '--kys-warn': first(WARNS, face, ink),
    '--kys-wash': c.join(' '),
    '--kys-module-mix': `${String(moduleMix(face, ink))}%`,
  };
}
