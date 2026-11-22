/**
 * A synth's Default patch groove (`f-livelier-patterns` t-303): the song its Default Saw plays in place of the C major
 * scale, with the drums on Match. The Default Saw is the first sound most visitors hear, so where a synth has one it
 * plays something worth hearing, while the scale stays second in its list for checking the tone by ear.
 *
 * Owner ruling (2026-11-22): the Model D first, with drums and no effects. Every other synth keeps the scale with the
 * drums off (t-295) until it is given one here. Code, as the Default patch itself is (`default-patch.ts`): no catalogue
 * row, so it credits nobody and has no sources.
 */
import type { Pattern, Step } from '@/lib/app/sequencer/pattern';
import { PATTERN_VERSION } from '@/lib/app/sequencer/pattern';

/** A Default patch's groove: its pattern, its name, and the style its drums are matched to. */
export interface DefaultGroove {
  name: string;
  /** A genre for the drums' Match (`drumStyleFor`). */
  style: string;
  pattern: Pattern;
}

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** `A3` → 57. C4 is 60. */
function midi(name: string): number {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + acc;
}

/**
 * A bar of sixteen steps, one token a step: `.` a rest (or the note held over it), `A3` a note for one step, `E5:3`
 * held for three. Each note stops a little short of its last step, so the next is struck afresh on the gate.
 */
function bar(text: string): Step[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length !== 16) throw new Error(`a bar has 16 steps, not ${tokens.length}: ${text}`);
  return tokens.map((t): Step => {
    if (t === '.') return { on: true, notes: [] };
    const [name, held] = t.split(':');
    return { on: true, notes: [{ note: midi(name), gate: Number(held ?? 1) - 0.3 }] };
  });
}

const part = (...bars: string[]) => ({ steps: bars.flatMap(bar) });

/**
 * The Model D's: Am, F, C, G, twice as rising arpeggios on the plain saw, then twice as a hook an octave up. The
 * arpeggios climb a little higher in each bar and the last runs up into the hook; the hook's long notes let the saw's
 * buzz ring, and its last bar leads back down to the top.
 */
const MODEL_D: DefaultGroove = {
  name: 'Default Saw groove',
  style: 'Synthwave',
  pattern: {
    version: PATTERN_VERSION,
    bpm: 116,
    stepSize: '1/16',
    loop: true,
    direction: 'forward',
    swing: 50,
    transpose: 0,
    root: 9,
    scale: 'minor',
    parts: [
      part(
        'A3 . C4 E4 A4 . E4 C4 A3 . C4 E4 A4 C5 A4 E4',
        'F3 . A3 C4 F4 . C4 A3 F3 . A3 C4 F4 A4 F4 C4',
        'C4 . E4 G4 C5 . G4 E4 C4 . E4 G4 C5 E5 C5 G4',
        'G3 . B3 D4 G4 . D4 B3 G3 B3 D4 G4 B4 D5 B4 G4'
      ),
      part(
        'E5:3 . . D5 C5:2 . B4 . C5:2 . A4:4 . . . E4 A4',
        'C5:3 . . A4 F4:2 . A4 . C5:2 . D5:4 . . . C5 A4',
        'G4:3 . . E4 C4:2 . E4 . G4:2 . C5:4 . . . B4 C5',
        'D5:2 . B4 . G4:2 . B4 . D5:2 . E5:2 . G5:2 . E5 D5'
      ),
    ],
    // Twice each: the arpeggios, then the hook.
    chain: [0, 0, 1, 1],
  },
};

const GROOVES: Record<string, DefaultGroove> = { 'model-d': MODEL_D };

/** The synth's Default patch groove, or null for one that plays the scale. */
export const defaultGrooveOf = (synthId: string): DefaultGroove | null => GROOVES[synthId] ?? null;
