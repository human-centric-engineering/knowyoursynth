/**
 * The pattern library's migration and seed (`f-pattern-library` t-122).
 *
 * Every seeded riff becomes a library pattern through `importPhrase`, and stays its sound's default: planned from the
 * real seed data, every one compiles (loop 0) to the riff's own notes, and none is missing. Then the sync, over the
 * stateful catalogue fake seeded from Model D's real sounds: a second run writes nothing, an admin's edit survives a
 * reseed, an empty catalogue writes nothing, and a riff an admin changes moves its default with it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Phrase, PhraseNote } from '@/lib/app/synths/contract';
import { PresetSchema } from '@/lib/app/synths/validate';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { importPhrase, phraseBeats } from '@/lib/app/sequencer/import';
import { PatternSchema } from '@/lib/app/sequencer/pattern';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import {
  followSoundRiff,
  riffLeadsDefault,
  riffProblem,
  phraseOf,
  planRiffPattern,
  riffInspiration,
  riffKey,
  syncRiffPatterns,
  syncSoundPhrases,
  toView,
  type InspirationContext,
  type LibraryDb,
  RIFF_MADE_BY,
} from '@/lib/app/patterns/library';
import { defaultRole, patternFacts } from '@/lib/app/patterns/library-facts';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import type { CatalogueSeedData } from '@/lib/app/catalogue/data';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import {
  catalogueTables,
  seedRecordTable,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';

const real = loadCatalogueData();

const ctx: InspirationContext = {
  artists: new Map([['kraftwerk', { id: 'kraftwerk', name: 'Kraftwerk' }]]),
  synthWords: new Set(['classic technique', 'various', 'moog', 'behringer', 'oberheim sem']),
  synths: new Map([['model-d', 'Model D']]),
};

const sounds = real.sounds.flatMap((file) =>
  file.sounds.map((s) => {
    const preset = PresetSchema.parse(s);
    return { ...preset, synthId: file.synth, slug: preset.id };
  })
);

/** Notes as the engine plays them: velocity filled in where a riff leaves it out, sorted. */
const heard = (notes: PhraseNote[]) =>
  notes
    .map(([b, n, len, v]) => [b, n, len, v ?? 0.85] as const)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);

function expectSameNotes(actual: PhraseNote[], expected: PhraseNote[]) {
  const a = heard(actual);
  const e = heard(expected);
  expect(a).toHaveLength(e.length);
  a.forEach((note, i) => {
    expect(note[0]).toBeCloseTo(e[i][0], 6);
    expect(note[1]).toBe(e[i][1]);
    expect(note[2]).toBeCloseTo(e[i][2], 6);
    expect(note[3]).toBe(e[i][3]);
  });
}

describe('every seeded riff, as a library pattern', () => {
  const planned = sounds.map((s) => ({ sound: s, row: planRiffPattern(s, ctx) }));

  it('plans one pattern per sound, each keyed by its sound, none missing or doubled', () => {
    // Without a floor, an empty catalogue would pass every test below.
    expect(sounds.length).toBeGreaterThan(2000);
    const keys = planned.map((p) => p.row.key);
    expect(new Set(keys).size).toBe(sounds.length);
    expect(new Set(keys)).toEqual(new Set(sounds.map((s) => `riff:${s.synthId}/${s.slug}`)));
  });

  it.each(planned.map((p) => [`${p.sound.synthId}/${p.sound.slug}`, p] as const))(
    '%s: its default compiles (loop 0) to the riff it had',
    (_id, { sound, row }) => {
      const pattern = PatternSchema.parse(row.pattern);
      const loop = compileLoop(pattern, { loop: 0, rng: seededRng(1) });
      expectSameNotes(loop.notes, sound.phrase.steps);
      expect(loop.beats).toBe(phraseBeats(sound.phrase));
      expect(pattern.bpm).toBe(sound.phrase.bpm);
      // What a sound whose default this is plays, read back the same way.
      expectSameNotes(phraseOf(pattern).steps, sound.phrase.steps);
      // Owner ruling, 2026-10-31: every riff is AI-generated, made by an agent with the library (t-156).
      expect(row).toMatchObject({
        fidelity: 'in_the_style_of',
        origin: 'ai_generated',
        madeBy: RIFF_MADE_BY,
      });
    }
  );
});

describe('the default role rule', () => {
  const role = (steps: PhraseNote[]) => defaultRole(steps, phraseBeats({ steps }));

  it('reads each role from the notes, in the design order', () => {
    expect(role([[0, 60, 4]])).toBe('held');
    expect(
      role([
        [0, 48, 4],
        [0, 52, 4],
        [0, 55, 4],
      ])
    ).toBe('held');
    expect(
      role([
        [0, 36, 0.25],
        [1, 38, 0.25],
        [2, 36, 0.25],
        [3, 38, 0.25],
      ])
    ).toBe('percussive');
    expect(
      role([
        [0, 60, 0.5],
        [0, 64, 0.5],
        [1, 62, 0.5],
        [1, 65, 0.5],
        [2, 60, 0.5],
        [2, 64, 0.5],
      ])
    ).toBe('chord_stabs');
    expect(
      role([
        [0, 60, 2],
        [0, 64, 2],
        [2, 62, 2],
        [2, 65, 2],
        [4, 60, 2],
        [4, 64, 2],
      ])
    ).toBe('chord_changes');
    expect(
      role([
        [0, 36, 0.5],
        [1, 43, 0.5],
        [2, 41, 0.5],
        [3, 39, 0.5],
      ])
    ).toBe('bass_line');
    expect(
      role([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((b, i): PhraseNote => [b, 60 + (i % 4) * 3, 0.25]))
    ).toBe('arp');
    expect(
      role([
        [0, 60, 2],
        [2, 62, 2],
        [4, 64, 2],
        [6, 65, 2],
      ])
    ).toBe('slow_melody');
    expect(
      role([
        [0, 60, 0.75],
        [1, 62, 0.75],
        [2, 64, 0.75],
        [3, 67, 0.75],
      ])
    ).toBe('lead_line');
  });

  it('calls a loop with no notes held, since nothing in it moves', () => {
    expect(defaultRole([], 4)).toBe('held');
  });
});

describe('the facts a pattern carries', () => {
  it('reads register, density, note length, voices, bars and slides from the notes', () => {
    const p = importPhrase({
      bpm: 120,
      loop: true,
      steps: [
        [0, 48, 0.5],
        [0, 52, 0.5],
        [1, 55, 0.5],
        [2, 60, 1],
      ],
    });
    p.parts[0].steps[4].slide = true;
    expect(patternFacts(p)).toEqual({
      register: { low: 48, high: 60, median: 53.5 },
      density: 1,
      noteLength: 0.625,
      voices: 2,
      bars: 0.75,
      slides: true,
    });
  });
});

describe("a riff's Inspired by", () => {
  it('links a databank artist, credits a synth, a maker or nobody to the synth, and keeps anything else as a genre', () => {
    expect(riffInspiration({ synthId: 'model-d', artist: 'Kraftwerk' }, ctx)).toEqual({
      inspiration: 'artist',
      inspiredBy: 'Kraftwerk',
      inspiredArtistId: 'kraftwerk',
      inspiredSynthId: null,
    });
    for (const credit of ['Classic technique', 'Various', 'Behringer', 'Oberheim SEM'])
      expect(riffInspiration({ synthId: 'model-d', artist: credit }, ctx)).toEqual({
        inspiration: 'synth',
        inspiredBy: 'Model D',
        inspiredArtistId: null,
        inspiredSynthId: 'model-d',
      });
    expect(riffInspiration({ synthId: 'model-d', artist: 'Berlin school' }, ctx)).toEqual({
      inspiration: 'genre',
      inspiredBy: 'Berlin school',
      inspiredArtistId: null,
      inspiredSynthId: null,
    });
  });
});

// ─── The sync, over the stateful fake ────────────────────────────────────────

let db: CatalogueTables;
const lib = () => db as unknown as LibraryDb;

/** Model D with its first four sounds. */
function sample(): CatalogueSeedData {
  const data = structuredClone(real);
  data.listing.synths = [{ id: 'model-d', order: 0, listed: true }];
  data.sounds = data.sounds
    .filter((f) => f.synth === 'model-d')
    .map((f) => ({ ...f, sounds: f.sounds.slice(0, 4) }));
  data.lineage = [];
  data.notes = [];
  return data;
}

const writes = () =>
  [db.libraryPattern, db.synthSoundPattern, db.synthSound].reduce(
    (n, t) => n + t.create.mock.calls.length + t.update.mock.calls.length,
    0
  );
const clearWrites = () => {
  for (const t of Object.values(db)) {
    t.create.mockClear();
    t.update.mockClear();
  }
};
const soundRow = (i: number) => db.synthSound.rows[i];
const patternOf = (i: number) => {
  const key = riffKey(String(soundRow(i).synthId), String(soundRow(i).slug));
  return db.libraryPattern.rows.find((p) => p.key === key)!;
};
const listOf = (i: number) =>
  db.synthSoundPattern.rows
    .filter((l) => l.soundId === soundRow(i).id)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((l) => l.patternId);

beforeEach(async () => {
  db = catalogueTables();
  const prisma = { ...db, catalogueSeedRecord: seedRecordTable() };
  await seedCatalogue(prisma as unknown as TenancyClient, sample());
  clearWrites();
});

describe('syncRiffPatterns', () => {
  it('gives every sound its riff as its only, default pattern', async () => {
    const counts = await syncRiffPatterns(lib());
    expect(counts).toEqual({ created: 4, updated: 0, unchanged: 0, edited: 0, rewritten: [] });
    expect(db.libraryPattern.rows).toHaveLength(4);
    db.synthSound.rows.forEach((_, i) => expect(listOf(i)).toEqual([patternOf(i).id]));
  });

  it('writes nothing the second time', async () => {
    await syncRiffPatterns(lib());
    clearWrites();
    expect(await syncRiffPatterns(lib())).toEqual({
      created: 0,
      updated: 0,
      unchanged: 4,
      edited: 0,
      rewritten: [],
    });
    expect(writes()).toBe(0);
  });

  it('writes nothing on an empty catalogue', async () => {
    db.synthSound.rows.length = 0;
    expect(await syncRiffPatterns(lib())).toEqual({
      created: 0,
      updated: 0,
      unchanged: 0,
      edited: 0,
      rewritten: [],
    });
    expect(writes()).toBe(0);
  });

  it("follows an unedited sound's changed riff, and leaves an admin-edited pattern alone", async () => {
    await syncRiffPatterns(lib());
    const changed: Phrase = { bpm: 100, loop: true, steps: [[0, 40, 1]] };
    soundRow(0).phrase = changed;
    soundRow(1).phrase = changed;
    patternOf(1).editedAt = new Date();
    patternOf(1).name = 'An admin named it';
    const kept = structuredClone(patternOf(1));
    clearWrites();

    const counts = await syncRiffPatterns(lib());

    expect(counts).toMatchObject({ updated: 1, edited: 1, unchanged: 2 });
    expect(PatternSchema.parse(patternOf(0).pattern)).toEqual(importPhrase(changed));
    expect(patternOf(1)).toEqual(kept);
  });

  it("adds a new sound's riff after the patterns an admin already gave it, never in front", async () => {
    await syncRiffPatterns(lib());
    // An admin put sound 1's riff on sound 0 as well, then a new riff key appears for sound 0 (a renamed seed key).
    db.libraryPattern.rows.splice(db.libraryPattern.rows.indexOf(patternOf(0)), 1);
    db.synthSoundPattern.rows.splice(
      db.synthSoundPattern.rows.findIndex((l) => l.soundId === soundRow(0).id),
      1
    );
    db.synthSoundPattern.rows.push({
      soundId: soundRow(0).id,
      patternId: patternOf(1).id,
      order: 0,
    });

    await syncRiffPatterns(lib());

    expect(listOf(0)).toEqual([patternOf(1).id, patternOf(0).id]);
  });
});

describe('a default changed by an admin', () => {
  beforeEach(async () => {
    await syncRiffPatterns(lib());
    clearWrites();
  });

  it("rewrites a sound's riff to its new default's notes, marked edited, once", async () => {
    // Sound 1's pattern put first on sound 0.
    for (const l of db.synthSoundPattern.rows) if (l.soundId === soundRow(0).id) l.order = 1;
    db.synthSoundPattern.rows.push({
      soundId: soundRow(0).id,
      patternId: patternOf(1).id,
      order: 0,
    });

    const rewritten = await syncSoundPhrases(
      lib(),
      { id: String(soundRow(0).id) },
      { markEdited: true }
    );

    expect(rewritten).toHaveLength(1);
    expectSameNotes((soundRow(0).phrase as Phrase).steps, (soundRow(1).phrase as Phrase).steps);
    expect(soundRow(0).editedAt).toBeInstanceOf(Date);
    clearWrites();
    expect(
      await syncSoundPhrases(lib(), { id: String(soundRow(0).id) }, { markEdited: true })
    ).toEqual([]);
    expect(writes()).toBe(0);
  });

  it('leaves a riff that already plays its default alone', async () => {
    expect(await syncSoundPhrases(lib(), {})).toEqual([]);
    expect(writes()).toBe(0);
  });

  it("follows a sound's riff into its own riff pattern, and every sound an admin put it first on, marked edited", async () => {
    // Sound 1's riff pattern, unedited, is also the default of sound 2.
    for (const l of db.synthSoundPattern.rows) if (l.soundId === soundRow(2).id) l.order = 1;
    db.synthSoundPattern.rows.push({
      soundId: soundRow(2).id,
      patternId: patternOf(1).id,
      order: 0,
    });
    const changed: Phrase = {
      bpm: 90,
      loop: true,
      steps: [
        [0, 45, 2],
        [2, 47, 2],
      ],
    };
    soundRow(1).phrase = changed;
    expect(await riffLeadsDefault(lib(), String(soundRow(1).id))).toBe(true);
    expect(await riffLeadsDefault(lib(), String(soundRow(2).id))).toBe(false);

    const rewritten = await followSoundRiff(lib(), String(soundRow(1).id));

    expect(PatternSchema.parse(patternOf(1).pattern)).toEqual(importPhrase(changed));
    expect(patternOf(1).editedAt).toBeNull();
    expect(rewritten.map((s) => s.slug)).toEqual([soundRow(2).slug]);
    expectSameNotes((soundRow(2).phrase as Phrase).steps, changed.steps);
    expect(soundRow(2).editedAt).toBeInstanceOf(Date);
  });

  it('stops a riff leading its own pattern once that pattern says it was transcribed', async () => {
    patternOf(3).editedAt = new Date();
    expect(await riffLeadsDefault(lib(), String(soundRow(3).id))).toBe(true);
    patternOf(3).fidelity = 'transcribed';
    expect(await riffLeadsDefault(lib(), String(soundRow(3).id))).toBe(false);
  });

  it("clears an admin's tempo range that a new riff's bpm falls outside", async () => {
    Object.assign(patternOf(3), { editedAt: new Date(), bpmMin: 140, bpmMax: 160 });
    soundRow(3).phrase = { bpm: 110, loop: true, steps: [[0, 50, 1]] };
    await followSoundRiff(lib(), String(soundRow(3).id));
    expect(patternOf(3)).toMatchObject({ bpmMin: null, bpmMax: null });
  });

  it("re-makes a sound's own unedited riff pattern from its riff, as the seed would", async () => {
    soundRow(3).phrase = { bpm: 110, loop: true, steps: [[0, 50, 1]] };
    soundRow(3).name = 'Renamed';

    expect(await followSoundRiff(lib(), String(soundRow(3).id))).toEqual([]);
    expect(patternOf(3)).toMatchObject({ name: 'Renamed', editedAt: null });
  });

  it('marks a default edited when only its name changed, so a reseed cannot split the pair', async () => {
    const before = structuredClone(soundRow(0).phrase);
    expect(
      await syncSoundPhrases(
        lib(),
        { patterns: { some: { patternId: String(patternOf(0).id) } } },
        { heads: [String(patternOf(0).id)], markEdited: true }
      )
    ).toEqual([]);
    expect(soundRow(0).phrase).toEqual(before);
    expect(soundRow(0).editedAt).toBeInstanceOf(Date);
    expect(soundRow(1).editedAt).toBeNull();
  });
});

describe('a pattern that can be a default', () => {
  const pattern = () =>
    importPhrase({
      bpm: 120,
      loop: true,
      steps: [
        [0, 48, 1],
        [1, 52, 1],
      ],
    });

  it('is one its riff plays whole', () => {
    expect(riffProblem(pattern())).toBeNull();
  });

  it('is not one that ends in rests, has a second part in its chain, or plays nothing', () => {
    const rests = pattern();
    rests.parts[0].steps.push(
      ...structuredClone(rests.parts[0].steps).map((s) => ({ ...s, notes: [] }))
    );
    expect(riffProblem(rests)).toMatch(/rests/);

    const ab = pattern();
    ab.parts.push(structuredClone(ab.parts[0]));
    ab.chain = [0, 1];
    expect(riffProblem(ab)).toMatch(/two parts/);

    const chance = pattern();
    chance.parts[0].steps[0].probability = 0.5;
    expect(riffProblem(chance)).toMatch(/probability/);

    const random = { ...pattern(), direction: 'random' as const };
    expect(riffProblem(random)).toMatch(/forward or in reverse/);

    const lanes = { ...pattern(), lanes: ['vcf.cutoff'] };
    expect(riffProblem(lanes)).toMatch(/mod lanes/);

    const silent = pattern();
    for (const step of silent.parts[0].steps) step.notes = [];
    expect(riffProblem(silent)).toMatch(/at least one note/);
  });
});

describe('the view', () => {
  it('serves a stored row with its facts, and leaves out one that no longer parses', async () => {
    await syncRiffPatterns(lib());
    const row = structuredClone(patternOf(0)) as Parameters<typeof toView>[0];
    const view = toView(row);
    expect(view?.facts.voices).toBeGreaterThan(0);
    expect(view?.name).toBe(soundRow(0).name);
    expect(toView({ ...row, pattern: { version: 99 } })).toBeNull();
  });
});
