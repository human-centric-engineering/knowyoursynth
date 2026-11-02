/**
 * What a library pattern's role and fidelity are called where a player reads them (`f-pattern-library` t-123): the
 * names in `.context/app/pattern-library.md` (Roles, Fidelity). Pure and client-safe, for the picker and anything else
 * a player reads them in.
 */
import type { PatternFidelity, PatternRole } from '@prisma/client';

/**
 * The path a control's refusal names when it would leave a sound with no enabled pattern
 * (`setLibraryPatternControl`): the admin page answers it by sending the change again with `acknowledge`.
 */
export const ACKNOWLEDGE_PATH = 'acknowledge';

export const ROLE_LABELS: Record<PatternRole, string> = {
  lead_line: 'Lead line',
  held: 'Held',
  bass_line: 'Bass line',
  slow_melody: 'Slow melody',
  percussive: 'Percussive',
  chord_changes: 'Chord changes',
  arp: 'Arp / sequence',
  chord_stabs: 'Chord stabs',
};

/** Each fidelity's label, and what it means in a sentence a player can read. */
export const FIDELITY_LABELS: Record<PatternFidelity, { label: string; means: string }> = {
  transcribed: {
    label: 'Transcribed',
    means: 'The notes come from a score or the original recording’s own parts, checked by ear.',
  },
  reconstructed: {
    label: 'Reconstructed',
    means: 'Worked out by ear and checked against a second source. It aims at the actual part.',
  },
  in_the_style_of: {
    label: 'In the style of',
    means: 'Not a specific part: written to sound like them.',
  },
};
