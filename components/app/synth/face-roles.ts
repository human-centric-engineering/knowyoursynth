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
import { hexChannels, luminance } from '@/lib/app/synths/lib/patch';

/*
 * The player's own colours, from its roles in `synth.css` (`.kys-player` by night, then by day): read here because the
 * choice between them is worked out from their contrast, which the stylesheet cannot do. Keep them in step.
 */
/** The player's accent on the dark stage, then on the light one: the first that stands off the face is used. */
const ACCENTS = ['#f6a63a', '#b85f06'] as const;
/** The ink on the accent: dark on the amber, white on a darker accent. */
const ON_ACCENT = ['#1b1204', '#ffffff'] as const;
/** The player's green (a finished lesson) and red-orange, by night then by day. */
const GOODS = ['#7ed267', '#2f8a1d'] as const;
const WARNS = ['#ff7d54', '#c2451f'] as const;
/** How far an accent, the faint text and a module's colour must stand off the face (WCAG's, for large text). */
export const MIN_CONTRAST = 3;
/** How far the muted text, and a chapter's number on its disc, must, as body text (WCAG's AA). */
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
  | '--kys-module-mix'
  | '--kys-chapter-num'
  | '--kys-chapter-disc-mix';

/** `p` (0–1) of `a` and the rest `b`, as CSS's `color-mix(in srgb, a p, b)`; `a` where either is not hex. */
export function mix(a: string, p: number, b: string): string {
  const ca = hexChannels(a);
  const cb = hexChannels(b);
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
 * The disc of the chapter the panel is at, and the number on it: as much of each module's colour as the strip keeps
 * (`p`, a percentage), less where no ink reads `BODY_CONTRAST` on every disc so mixed (a cream face's discs are
 * mid-tones), the rest the ink. The number is whichever of the player's two inks, the ink and the face reads best.
 */
function chapterDisc(
  face: string,
  ink: string,
  accent: string,
  p: number
): { q: number; num: string } {
  const colours = [...new Set([...Object.values(MODULES).map((m) => m.color), accent])];
  const inks = [...ON_ACCENT, ink, face];
  const want = Math.min(BODY_CONTRAST, contrast(ink, face));
  for (let q = p; q >= 0; q -= 5) {
    const discs = colours.map((c) => mix(c, q / 100, ink));
    const worst = (n: string) => Math.min(...discs.map((d) => contrast(n, d)));
    const num = inks.reduce((x, y) => (worst(y) > worst(x) ? y : x));
    if (worst(num) >= want) return { q, num };
  }
  return { q: 0, num: face };
}

/**
 * The `--kys-*` roles in a faceplate's colours. `face2` is the darker shade the strip's gradient ends on. A face or
 * ink that is not hex has none (`undefined`), so the pieces keep the player's roles and are not drawn as faced.
 */
export function faceRoles(
  face: string,
  face2: string,
  ink: string
): (CSSProperties & Partial<Record<FaceRole, string>>) | undefined {
  const c = hexChannels(ink);
  if (!c || !hexChannels(face)) return undefined;
  const shade = hexChannels(face2) ? face2 : face;
  const { accent, on } = accentFor(face, ink);
  const p = moduleMix(face, ink);
  const disc = chapterDisc(face, ink, accent, p);
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
    '--kys-module-mix': `${String(p)}%`,
    '--kys-chapter-num': disc.num,
    '--kys-chapter-disc-mix': `${String(disc.q)}%`,
  };
}
