/**
 * Suggestions (`f-pattern-library` t-125): which library patterns suit a sound, and when a patch has moved far enough
 * from its library sound to be offered them.
 *
 * The sounds are hand-built patches read by the real detector, so the model was never fitted to them. The candidates
 * are every riff in the real seed data, with the role the default role rule gives it, so the rankings are the ones the
 * library would give.
 *
 * @see lib/app/patterns/suggest.ts
 */

import { describe, it, expect } from 'vitest';

import { defaultRole, firstLoop, patternFacts } from '@/lib/app/patterns/library-facts';
import {
  kindDistance,
  kindSummary,
  movedFar,
  MOVED_FAR,
  rankPatterns,
  SoundFeaturesSchema,
  soundTraits,
  type SuggestCandidate,
  type SuggestContext,
} from '@/lib/app/patterns/suggest';
import { importPhrase } from '@/lib/app/sequencer/import';
import type { EngineParams } from '@/lib/app/synths/contract';
import { getSynthDef } from '@/lib/app/synths/defs';
import { presetState } from '@/lib/app/synths/lib/patch';
import { engineOf } from '@/lib/app/synths/lib/predict';
import { soundFeatures, soundKind, type SoundKind } from '@/lib/app/synths/lib/soundkind';
import { validatePreset } from '@/lib/app/synths/validate';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import { monoParams } from '@/tests/unit/lib/app/synths/audio/render';

const CATALOGUE = loadCatalogueData();

/** Every library riff as a candidate, keyed `<synth>/<sound>`. */
const RIFFS: SuggestCandidate[] = CATALOGUE.sounds.flatMap((file) =>
  file.sounds.map((sound) => {
    const pattern = importPhrase(sound.phrase);
    const { notes, beats } = firstLoop(pattern);
    return {
      id: `${file.synth}/${String(sound.id)}`,
      name: String(sound.name),
      role: defaultRole(notes, beats),
      fidelity: 'in_the_style_of' as const,
      facts: patternFacts(pattern),
      inspiredBy: { artistId: null, synthId: null },
    };
  })
);
const byId = new Map(RIFFS.map((c) => [c.id, c]));
const NO_CONTEXT: SuggestContext = { synthId: 'model-d', artistId: null, exclude: new Set() };

const silentOsc = [
  { level: 0, mix: { saw: 1 }, semi: 0 },
  { level: 0, mix: { pulse: 1 }, semi: 0 },
  { level: 0, mix: { tri: 1 }, semi: 0 },
];

/** A plucked bass: an octave and two below the key, a low filter snapped open and shut. */
const pluckBass = (): EngineParams =>
  monoParams({
    osc: [
      { level: 0.8, mix: { saw: 1 }, semi: -12 },
      { level: 0.5, mix: { pulse: 1 }, pw: 0.4, semi: -24 },
      silentOsc[2],
    ],
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 300,
      res: 0.4,
      envAmt: 3,
      envSrc: 'env1',
      kbd: 0.3,
    },
    env1: { a: 0.002, d: 0.12, s: 0, r: 0.05 },
    env2: { a: 0.002, d: 0.25, s: 0, r: 0.05 },
  });

/** Two saws swelling in over a second and holding: six voices, or one. */
const pad = (voices: number): EngineParams =>
  monoParams({
    ...(voices > 1 ? { poly: { voices, stack: 1, mono: false } } : {}),
    osc: [
      { level: 0.6, mix: { saw: 1 }, semi: 0 },
      { level: 0.6, mix: { saw: 1 }, semi: 0 },
      silentOsc[2],
    ],
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 1200,
      res: 0.1,
      envAmt: 0.5,
      envSrc: 'env1',
      kbd: 0.5,
    },
    env1: { a: 1.2, d: 0.5, s: 0.8, r: 1.5 },
    env2: { a: 1.2, d: 0.5, s: 0.9, r: 1.5 },
  });

/** A noise hit: no oscillators, gone in a tenth of a second. */
const noiseHit = (): EngineParams =>
  monoParams({
    osc: silentOsc,
    noise: { level: 1 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: 3000,
      res: 0.2,
      envAmt: 2,
      envSrc: 'env1',
      kbd: 0,
    },
    env1: { a: 0.001, d: 0.05, s: 0, r: 0.03 },
    env2: { a: 0.001, d: 0.08, s: 0, r: 0.03 },
  });

function kindOfPatch(p: EngineParams): SoundKind {
  const kind = soundKind(p);
  if (!kind) throw new Error('the test patch is silent');
  return kind;
}

const BASS = kindOfPatch(pluckBass());
const PAD = kindOfPatch(pad(6));
const MONO_PAD = kindOfPatch(pad(1));
const HIT = kindOfPatch(noiseHit());

const rank = (kind: SoundKind, limit = 8, ctx = NO_CONTEXT) =>
  rankPatterns(kind, RIFFS, ctx, limit);
const roles = (kind: SoundKind, limit = 8) => rank(kind, limit).map((s) => s.role);
const share = (list: string[], wanted: string[]) =>
  list.filter((r) => wanted.includes(r)).length / list.length;

describe('rankPatterns', () => {
  it('offers a bass patch bass lines first, mostly bass lines, low ones', () => {
    const picks = rank(BASS);
    expect(picks).toHaveLength(8);
    expect(picks[0].role).toBe('bass_line');
    expect(share(roles(BASS), ['bass_line'])).toBeGreaterThanOrEqual(0.6);
    for (const s of picks.filter((p) => p.role === 'bass_line'))
      expect(byId.get(s.id)?.facts.register?.median).toBeLessThan(48);
  });

  it('offers a pad held parts, chord changes and slow melodies', () => {
    const list = roles(PAD);
    expect(['held', 'chord_changes', 'slow_melody']).toContain(list[0]);
    expect(share(list, ['held', 'chord_changes', 'slow_melody'])).toBeGreaterThanOrEqual(0.75);
    expect(list).toContain('chord_changes'); // six voices: chords are on offer
  });

  it('offers a percussive patch percussive patterns first, and no long held lines', () => {
    const picks = rank(HIT);
    expect(picks[0].role).toBe('percussive');
    expect(share(roles(HIT), ['percussive', 'arp', 'lead_line'])).toBeGreaterThanOrEqual(0.6);
    expect(picks.filter((p) => p.role === 'slow_melody')).toEqual([]);
  });

  it('never offers a mono patch a pattern that plays more notes at once than it can, however many are asked for', () => {
    // The population has chords to refuse, and a pad's roles want them.
    expect(RIFFS.filter((c) => c.facts.voices > 1).length).toBeGreaterThan(100);
    expect(MONO_PAD.roles.chord_changes).toBeGreaterThan(0.05);
    const picks = rank(MONO_PAD, 200);
    expect(picks).toHaveLength(200);
    expect(picks.map((s) => byId.get(s.id)?.facts.voices)).toEqual(picks.map(() => 1));
    expect(picks.filter((s) => s.role === 'chord_changes' || s.role === 'chord_stabs')).toEqual([]);
    // The six-voice pad gets them from the same library.
    expect(rank(PAD, 200).some((s) => (byId.get(s.id)?.facts.voices ?? 0) > 1)).toBe(true);
  });

  it('leaves out the sound’s own patterns and patterns with no notes', () => {
    const top = rank(BASS, 3);
    const without = rank(BASS, 3, { ...NO_CONTEXT, exclude: new Set([top[0].id]) });
    expect(without.map((s) => s.id)).not.toContain(top[0].id);
    const empty: SuggestCandidate = { ...RIFFS[0], id: 'empty', role: 'bass_line' };
    empty.facts = { ...empty.facts, register: null };
    expect(rankPatterns(BASS, [empty], NO_CONTEXT, 5)).toEqual([]);
  });

  it('lifts a researched pattern of the same artist or synth where it fits, and says so', () => {
    const plain = rank(BASS, 30);
    // A bass line well down the list, made researched and the artist's.
    const low = plain.filter((s) => s.role === 'bass_line')[10];
    const lifted = (inspiredBy: SuggestCandidate['inspiredBy']) =>
      RIFFS.map((c) =>
        c.id === low.id ? { ...c, fidelity: 'reconstructed' as const, inspiredBy } : c
      );
    const artist = rankPatterns(
      BASS,
      lifted({ artistId: 'kraftwerk', synthId: null }),
      { ...NO_CONTEXT, artistId: 'kraftwerk' },
      30
    );
    const at = (list: { id: string }[]) => list.findIndex((s) => s.id === low.id);
    expect(at(artist)).toBeLessThan(at(plain));
    expect(artist[at(artist)].reason).toMatch(/ · same artist$/);
    const synth = rankPatterns(
      BASS,
      lifted({ artistId: null, synthId: 'model-d' }),
      NO_CONTEXT,
      30
    );
    expect(at(synth)).toBeLessThan(at(plain));
    expect(synth[at(synth)].reason).toMatch(/ · this synth$/);
    // Only researched patterns are lifted: the same link on an In the style of riff is not.
    const styled = RIFFS.map((c) =>
      c.id === low.id ? { ...c, inspiredBy: { artistId: 'kraftwerk', synthId: null } } : c
    );
    expect(at(rankPatterns(BASS, styled, { ...NO_CONTEXT, artistId: 'kraftwerk' }, 30))).toBe(
      at(plain)
    );
    // Nor is a researched pattern of a role the sound does not suit.
    const wrongRole = RIFFS.find((c) => c.role === 'chord_changes');
    expect(wrongRole).toBeDefined();
    expect(BASS.roles.chord_changes).toBeLessThan(0.05);
    const off = RIFFS.map((c) =>
      c.id === wrongRole?.id
        ? {
            ...c,
            fidelity: 'transcribed' as const,
            inspiredBy: { artistId: 'kraftwerk', synthId: null },
          }
        : c
    );
    expect(
      rankPatterns(BASS, off, { ...NO_CONTEXT, artistId: 'kraftwerk' }, 30).map((s) => s.id)
    ).not.toContain(wrongRole?.id);
  });

  it('gives each a reason naming what it heard and the part, and is the same every time', () => {
    const picks = rank(PAD);
    expect(picks[0].reason).toMatch(/^slow attack, holds, plays chords → /);
    expect(rank(PAD)).toEqual(picks);
    expect(picks.every((s, i) => i === 0 || s.score > 0)).toBe(true);
  });
});

describe('soundTraits and kindSummary', () => {
  it('names how a sound starts and holds, its register and its voices, at most three', () => {
    expect(soundTraits(PAD)).toEqual(['slow attack', 'holds', 'plays chords']);
    expect(soundTraits(BASS)).toEqual(['sharp attack', 'dies away', 'low register']);
    expect(kindSummary(BASS)).toMatch(/^sharp attack, dies away, low register → bass line, /);
  });
});

describe('movedFar', () => {
  const def = getSynthDef('model-d');
  if (!def) throw new Error('no Model D');
  const file = CATALOGUE.sounds.find((f) => f.synth === 'model-d');
  const sound = (category: string) => {
    const raw = file?.sounds.find((s) => Array.isArray(s.tags) && s.tags[0] === category);
    const checked = raw && validatePreset(def, raw);
    if (!checked || !checked.ok) throw new Error(`no Model D ${category}`);
    return presetState(def, checked.value);
  };
  const read = (s: {
    values: Parameters<typeof engineOf>[1];
    cables: Parameters<typeof engineOf>[2];
  }) => soundFeatures(engineOf(def, s.values, s.cables, 0));
  const bass = sound('bass');
  const start = read(bass);

  it('does not offer more for a library sound as it came', () => {
    expect(kindDistance(start, read(bass))).toBe(0);
    expect(movedFar(start, read(bass))).toBe(false);
  });

  it('offers more once the patch sounds like another sound', () => {
    const far = read(sound('pad'));
    expect(kindDistance(start, far)).toBeGreaterThan(MOVED_FAR);
    expect(movedFar(start, far)).toBe(true);
  });

  it('always offers more with no library sound to start from, and when a patch falls silent or comes back', () => {
    expect(movedFar(null, start)).toBe(true);
    const silent = { ...start, silent: true };
    expect(movedFar(start, silent)).toBe(true);
    expect(movedFar(silent, silent)).toBe(false);
  });
});

describe('SoundFeaturesSchema', () => {
  it('takes what the detector reads and refuses what is not a reading', () => {
    const f = soundFeatures(pad(6));
    expect(SoundFeaturesSchema.parse(f)).toEqual(f);
    expect(SoundFeaturesSchema.safeParse({ ...f, voices: 0 }).success).toBe(false);
    expect(SoundFeaturesSchema.safeParse({ ...f, attack: Number.NaN }).success).toBe(false);
    expect(SoundFeaturesSchema.safeParse({ ...f, noise: 2 }).success).toBe(false);
    const { levels: _levels, ...noLevels } = f;
    expect(SoundFeaturesSchema.safeParse(noLevels).success).toBe(false);
  });
});
