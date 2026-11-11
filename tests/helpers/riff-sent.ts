/**
 * The riff played through the sequencer (t-234): what the page sends the engine to play a sound's riff is a `pattern`
 * message, the riff imported as a pattern and compiled for its first loop. `t-78`'s import test holds the import to the
 * riff's own notes; these say which riff a page sent.
 */
import { expect } from 'vitest';
import type { Phrase, PhraseNote } from '@/lib/app/synths/contract';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { importPhrase } from '@/lib/app/sequencer/import';

/** A message as a test's engine mock recorded it. */
type Sent = { type: string } & Record<string, unknown>;

/** The `pattern` messages among those sent: each the start of a run of the sequencer. */
export const patternsSent = (sent: readonly Sent[]) => sent.filter((m) => m.type === 'pattern');

/** The notes a riff plays as the sequencer's first loop of it. */
export const riffNotes = (phrase: Phrase): PhraseNote[] =>
  compileLoop(importPhrase(phrase), { loop: 0, rng: seededRng(1) }).notes;

/** That `m` starts `phrase` through the sequencer: its notes, at its tempo (or `bpm`, a tempo knob's). */
export function expectRiff(m: Sent | undefined, phrase: Phrase, bpm: number = phrase.bpm) {
  expect(m).toMatchObject({ type: 'pattern', bpm, loop: { notes: riffNotes(phrase) } });
}
