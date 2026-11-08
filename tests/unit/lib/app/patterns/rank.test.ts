/**
 * The whole library ranked for the patch on the panel (`f-pattern-picker` t-212): every pattern once, in a section per
 * role, the sections by the patch's share of each role and the patterns in each by fit.
 *
 * The sounds are hand-built patches read by the real detector. The candidates are every riff in the real seed data,
 * with the role the default role rule gives it, so the sections are the ones the library would give.
 *
 * @see lib/app/patterns/rank.ts
 */

import { describe, it, expect } from 'vitest';

import { defaultRole, firstLoop, patternFacts } from '@/lib/app/patterns/library-facts';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-roles';
import { rankLibrary, type RankCandidate, type RankSection } from '@/lib/app/patterns/rank';
import { rankPatterns, type SuggestContext } from '@/lib/app/patterns/suggest';
import { importPhrase } from '@/lib/app/sequencer/import';
import type { EngineParams } from '@/lib/app/synths/contract';
import { getSynthDef } from '@/lib/app/synths/defs';
import { soundKind, type SoundKind } from '@/lib/app/synths/lib/soundkind';
import { validatePreset } from '@/lib/app/synths/validate';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import { monoParams } from '@/tests/unit/lib/app/synths/audio/render';

const CATALOGUE = loadCatalogueData();

/** Every library riff as a candidate, keyed `<synth>/<sound>`. */
const RIFFS: RankCandidate[] = CATALOGUE.sounds.flatMap((file) => {
  const def = getSynthDef(file.synth);
  if (!def) throw new Error(`no definition for ${file.synth}`);
  return file.sounds.map((input) => {
    const checked = validatePreset(def, input);
    if (!checked.ok) throw new Error(`${file.synth}: a sound that is not valid`);
    const sound = checked.value;
    const pattern = importPhrase(sound.phrase);
    const { notes, beats } = firstLoop(pattern);
    return {
      id: `${file.synth}/${sound.id}`,
      name: sound.name,
      role: defaultRole(notes, beats, [sound.tags]),
      fidelity: 'in_the_style_of' as const,
      facts: patternFacts(pattern),
      inspiredBy: {
        kind: 'genre' as const,
        label: 'Funk',
        songId: null,
        partId: null,
        artistId: null,
        synthId: null,
      },
    };
  });
});
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

function kindOfPatch(p: EngineParams): SoundKind {
  const kind = soundKind(p);
  if (!kind) throw new Error('the test patch is silent');
  return kind;
}

const BASS = kindOfPatch(pluckBass());
const PAD = kindOfPatch(pad(6));
const MONO_PAD = kindOfPatch(pad(1));

const ids = (sections: RankSection[]) => sections.flatMap((s) => s.patterns.map((p) => p.id));
const section = (sections: RankSection[], role: string) => {
  const found = sections.find((s) => s.role === role);
  if (!found) throw new Error(`no ${role} section`);
  return found;
};

describe('rankLibrary', () => {
  it('lists every candidate exactly once, in a section of its own role, with a reading or without', () => {
    expect(RIFFS.length).toBeGreaterThan(1000);
    const all = RIFFS.map((c) => c.id).sort();
    for (const kind of [BASS, PAD, MONO_PAD, null]) {
      const sections = rankLibrary(kind, RIFFS, NO_CONTEXT);
      expect(sections.map((s) => s.role).sort()).toEqual([...PATTERN_ROLES].sort());
      expect([...ids(sections)].sort()).toEqual(all);
      for (const s of sections) for (const p of s.patterns) expect(p.role).toBe(s.role);
    }
  });

  it('puts the sections in order of the patch’s share of each role, those it barely suits included, last', () => {
    for (const kind of [BASS, PAD]) {
      const sections = rankLibrary(kind, RIFFS, NO_CONTEXT);
      const shares = sections.map((s) => s.share ?? -1);
      expect(shares).toEqual([...shares].sort((a, b) => b - a));
      expect(sections[0].role).toBe(kind.role);
    }
    // A bass barely suits chord changes, and still lists them, after the roles it does suit.
    expect(BASS.roles.chord_changes).toBeLessThan(0.05);
    const bass = rankLibrary(BASS, RIFFS, NO_CONTEXT);
    expect(section(bass, 'chord_changes').patterns.length).toBeGreaterThan(0);
    expect(bass.findIndex((s) => s.role === 'chord_changes')).toBeGreaterThan(
      bass.findIndex((s) => s.role === 'bass_line')
    );
  });

  it('orders a section by the fit suggestions rank by, with the same reasons', () => {
    // Within the roles a bass suits, the patterns it can play come in the order `rankPatterns` offers them.
    const offered = rankPatterns(BASS, RIFFS, NO_CONTEXT, RIFFS.length);
    const bassLines = section(rankLibrary(BASS, RIFFS, NO_CONTEXT), 'bass_line').patterns;
    const suggested = offered.filter((s) => s.role === 'bass_line');
    expect(suggested.length).toBeGreaterThan(10);
    expect(bassLines.slice(0, suggested.length).map((p) => [p.id, p.why])).toEqual(
      suggested.map((s) => [s.id, s.reason])
    );
    // Low lines lead, for a low patch.
    for (const p of bassLines.slice(0, 5))
      expect(byId.get(p.id)?.facts.register?.median).toBeLessThan(48);
  });

  it('lifts a researched pattern of the same artist within its section, and says so', () => {
    const plain = section(rankLibrary(BASS, RIFFS, NO_CONTEXT), 'bass_line').patterns;
    const low = plain[20];
    const lifted = RIFFS.map((c) =>
      c.id === low.id
        ? {
            ...c,
            fidelity: 'reconstructed' as const,
            inspiredBy: { ...c.inspiredBy, kind: 'artist' as const, artistId: 'kraftwerk' },
          }
        : c
    );
    const ranked = section(
      rankLibrary(BASS, lifted, { ...NO_CONTEXT, artistId: 'kraftwerk' }),
      'bass_line'
    ).patterns;
    const at = ranked.findIndex((p) => p.id === low.id);
    expect(at).toBeLessThan(20);
    expect(ranked[at].why).toMatch(/ · same artist$/);
    expect(ranked[at]).toMatchObject({
      fidelity: 'reconstructed',
      inspiredBy: { artistId: 'kraftwerk' },
    });
  });

  it('leaves out the sound’s own patterns, which the picker lists first', () => {
    const own = section(rankLibrary(BASS, RIFFS, NO_CONTEXT), 'bass_line').patterns.slice(0, 2);
    expect(own).toHaveLength(2);
    const exclude = new Set(own.map((p) => p.id));
    for (const kind of [BASS, null]) {
      const listed = ids(rankLibrary(kind, RIFFS, { ...NO_CONTEXT, exclude }));
      expect(listed).toHaveLength(RIFFS.length - 2);
      for (const id of exclude) expect(listed).not.toContain(id);
    }
  });

  it('puts what a mono patch cannot play last in its section, marked, and marks nothing a six-voice patch can play', () => {
    const chords = (s: RankSection) =>
      s.patterns.filter((p) => (byId.get(p.id)?.facts.voices ?? 0) > 1);
    const mono = rankLibrary(MONO_PAD, RIFFS, NO_CONTEXT);
    // Every section's chords come after its single lines; a mono patch suits drones, so the held section is one with
    // both to order, and chords it would otherwise put first.
    for (const s of mono) {
      const many = chords(s);
      expect(s.patterns.slice(s.patterns.length - many.length)).toEqual(many);
    }
    const held = section(mono, 'held');
    const many = chords(held);
    expect(many.length).toBeGreaterThan(5);
    expect(many.length).toBeLessThan(held.patterns.length);
    const unmarked = section(rankLibrary(PAD, RIFFS, NO_CONTEXT), 'held').patterns;
    expect(unmarked.findIndex((p) => (byId.get(p.id)?.facts.voices ?? 0) > 1)).toBeLessThan(
      held.patterns.length - many.length
    );
    for (const s of mono)
      for (const p of s.patterns)
        expect(p.tooManyVoices).toBe((byId.get(p.id)?.facts.voices ?? 0) > 1);
    const six = rankLibrary(PAD, RIFFS, NO_CONTEXT);
    expect(chords(section(six, 'chord_changes')).length).toBeGreaterThan(10);
    expect(six.flatMap((s) => s.patterns).some((p) => p.tooManyVoices)).toBe(false);
  });

  it('with no reading, lists the roles in their order and each by name, with no share and no why', () => {
    const sections = rankLibrary(null, RIFFS, NO_CONTEXT);
    expect(sections.map((s) => s.role)).toEqual([...PATTERN_ROLES]);
    for (const s of sections) {
      expect(s.share).toBeNull();
      const names = s.patterns.map((p) => p.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
      for (const p of s.patterns) expect(p).toMatchObject({ why: null, tooManyVoices: false });
    }
  });

  it('gives each pattern as a lean row: no notes, its length and its Inspired by', () => {
    const [first] = rankLibrary(BASS, RIFFS, NO_CONTEXT)[0].patterns;
    const source = byId.get(first.id);
    expect(Object.keys(first).sort()).toEqual(
      ['bars', 'fidelity', 'id', 'inspiredBy', 'name', 'role', 'tooManyVoices', 'why'].sort()
    );
    expect(first.bars).toBe(source?.facts.bars);
    expect(first.inspiredBy).toEqual(source?.inspiredBy);
  });
});
