/**
 * Researched defaults (`f-pattern-library` t-254): `data/pattern-defaults.json`, and the seed that makes each listed
 * pattern its sound's default.
 *
 * First the real file, against the real catalogue and batches: the TEO-5's Jump Brass defaults to the Jump riff, every
 * entry names a sound and a pattern that are there and on each other, every default can be one, and every sound a
 * batch names is decided one way or the other. Then the seed, over the stateful catalogue fake seeded from Model D's
 * real sounds: the pattern goes in front and the riff follows it, a re-run and an empty list write nothing, an
 * admin's sound is left alone, what cannot be a default is skipped, and the catalogue seed stops writing the riff back.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PatternSchema } from '@/lib/app/sequencer/pattern';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import {
  loadPatternData,
  loadPatternDefaults,
} from '@/prisma/seeds/app-knowyoursynth/pattern-data';
import {
  phraseOf,
  riffKey,
  riffProblem,
  syncRiffPatterns,
  type LibraryDb,
} from '@/lib/app/patterns/library';
import { syncResearchedPatterns, type ResearchBatch } from '@/lib/app/patterns/library-researched';
import {
  PatternDefaultsSchema,
  syncResearchedDefaults,
  type PatternDefault,
} from '@/lib/app/patterns/library-defaults';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import type { CatalogueSeedData } from '@/lib/app/catalogue/data';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import {
  catalogueTables,
  seedRecordTable,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';

const catalogue = loadCatalogueData();
const batches = loadPatternData();
const file = loadPatternDefaults();
const patterns = new Map(batches.flatMap((b) => b.patterns).map((p) => [p.key, p]));
const soundIds = new Set(
  catalogue.sounds.flatMap((f) => f.sounds.map((s) => `${f.synth}/${String(s.id)}`))
);

describe('the defaults file', () => {
  it('makes the TEO-5’s Jump Brass play the Jump riff, the bug this file was made for', () => {
    expect(file.defaults).toContainEqual({
      sound: 'teo-5/teo-jump-brass',
      pattern: 'researched:van-halen/jump-riff-low',
    });
  });

  it('names only sounds in the catalogue and patterns in the batches, each pattern naming its sound', () => {
    const entries = [...file.defaults, ...file.notDefault];
    expect(entries.length).toBeGreaterThan(1000);
    expect(entries.filter((e) => !soundIds.has(e.sound))).toEqual([]);
    expect(entries.filter((e) => !patterns.get(e.pattern)?.sounds.includes(e.sound))).toEqual([]);
  });

  it('lists only patterns that can be a default: they play whole as a riff', () => {
    const cannot = file.defaults.flatMap((d) => {
      const problem = riffProblem(patterns.get(d.pattern)!.pattern);
      return problem ? [`${d.sound}: ${problem}`] : [];
    });
    expect(cannot).toEqual([]);
  });

  it('decides every sound a batch names, once: a default, or a reason it keeps its own riff', () => {
    const decided = [...file.defaults, ...file.notDefault].map((e) => e.sound);
    expect(decided.length).toBe(new Set(decided).size);
    const named = new Set([...patterns.values()].flatMap((p) => p.sounds));
    expect([...named].filter((s) => !decided.includes(s))).toEqual([]);
  });

  it('refuses a sound given two defaults', () => {
    const twice = {
      ...file,
      defaults: [file.defaults[0], { ...file.defaults[0], pattern: file.defaults[1].pattern }],
    };
    expect(PatternDefaultsSchema.safeParse(twice).success).toBe(false);
  });
});

// ─── The seed ────────────────────────────────────────────────────────────────

let db: CatalogueTables;
const lib = () => db as unknown as LibraryDb;
const prisma = () =>
  ({ ...db, catalogueSeedRecord: records }) as unknown as TenancyClient & {
    catalogueSeedRecord: ReturnType<typeof seedRecordTable>;
  };
let records: ReturnType<typeof seedRecordTable>;

/** Model D with its first three sounds. */
function sample(): CatalogueSeedData {
  const data = structuredClone(catalogue);
  data.listing.synths = [{ id: 'model-d', order: 0, listed: true }];
  data.sounds = data.sounds
    .filter((f) => f.synth === 'model-d')
    .map((f) => ({ ...f, sounds: f.sounds.slice(0, 3) }));
  data.lineage = [];
  data.notes = [];
  return data;
}

const soundRow = (i: number) => db.synthSound.rows[i];
const ref = (i: number) => `model-d/${String(soundRow(i).slug)}`;
const listOf = (i: number) =>
  db.synthSoundPattern.rows
    .filter((l) => l.soundId === soundRow(i).id)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map((l) => l.patternId);
const riffOf = (i: number) =>
  db.libraryPattern.rows.find((p) => p.key === riffKey('model-d', String(soundRow(i).slug)))!;
const keyed = (key: string) => db.libraryPattern.rows.find((p) => p.key === key)!;
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

const JUMP = 'researched:van-halen/jump-riff-low';
const JCGE = 'researched:depeche-mode/just-cant-get-enough-bass';

/** Two real patterns that can be defaults: Jump on sounds 0 and 1, Just Can’t Get Enough on sound 2. */
function testBatch(): ResearchBatch {
  const [a, b] = [JUMP, JCGE].map((k) => structuredClone(patterns.get(k)!));
  return {
    task: 't-162',
    researchedBy: 'a test',
    researchedAt: '2026-11-02',
    patterns: [
      { ...a, inspiredBy: { kind: 'genre', label: 'Arena rock' }, sounds: [ref(0), ref(1)] },
      { ...b, inspiredBy: { kind: 'genre', label: 'Synth-pop' }, sounds: [ref(2)] },
    ],
    notRecreated: [],
  };
}

const defaults = (): PatternDefault[] => [
  { sound: ref(0), pattern: JUMP },
  { sound: ref(2), pattern: JCGE },
];

beforeEach(async () => {
  db = catalogueTables();
  records = seedRecordTable();
  await seedCatalogue(prisma(), sample());
  await syncRiffPatterns(lib());
  await syncResearchedPatterns(lib(), [testBatch()]);
  clearWrites();
});

describe('syncResearchedDefaults', () => {
  it('has fixtures that can be defaults, or the checks below prove nothing', () => {
    for (const key of [JUMP, JCGE]) expect(riffProblem(patterns.get(key)!.pattern)).toBeNull();
  });

  it('puts the pattern in front of the riff, keeps the riff, and makes the sound play the pattern', async () => {
    const before = structuredClone(soundRow(1));
    const counts = await syncResearchedDefaults(lib(), defaults());

    expect(counts).toEqual({ promoted: 2, unchanged: 0, edited: 0, rewritten: 2, skipped: [] });
    expect(listOf(0)).toEqual([keyed(JUMP).id, riffOf(0).id]);
    expect(listOf(2)).toEqual([keyed(JCGE).id, riffOf(2).id]);
    expect(soundRow(0).phrase).toEqual(phraseOf(PatternSchema.parse(keyed(JUMP).pattern)));
    expect(soundRow(2).phrase).toEqual(phraseOf(PatternSchema.parse(keyed(JCGE).pattern)));
    // The seed's choice, not an admin's: the sound stays the seed's to write.
    expect(soundRow(0).editedAt).toBeNull();
    // Sound 1 has Jump on its list too, and no entry: it keeps its riff as its default.
    expect(listOf(1)).toEqual([riffOf(1).id, keyed(JUMP).id]);
    expect(soundRow(1)).toEqual(before);
  });

  it('writes nothing on a second run, nor for an empty list', async () => {
    await syncResearchedDefaults(lib(), defaults());
    clearWrites();
    expect(await syncResearchedDefaults(lib(), defaults())).toEqual({
      promoted: 0,
      unchanged: 2,
      edited: 0,
      rewritten: 0,
      skipped: [],
    });
    expect(await syncResearchedDefaults(lib(), [])).toMatchObject({ promoted: 0, unchanged: 0 });
    expect(writes()).toBe(0);
  });

  it('leaves alone a sound an admin edited, and one whose default an admin chose', async () => {
    soundRow(0).editedAt = new Date();
    // Sound 2: an admin put another sound's riff first.
    db.synthSoundPattern.rows.push({ soundId: soundRow(2).id, patternId: riffOf(1).id, order: -5 });
    const counts = await syncResearchedDefaults(lib(), defaults());
    expect(counts).toMatchObject({ promoted: 0, edited: 2 });
    expect(listOf(0)[0]).toBe(riffOf(0).id);
    expect(listOf(2)[0]).toBe(riffOf(1).id);
    expect(writes()).toBe(0);
  });

  it('skips, with the reason, a sound or place not there and a pattern that cannot be a default', async () => {
    keyed(JCGE).status = 'disabled';
    const counts = await syncResearchedDefaults(lib(), [
      { sound: 'model-d/not-a-sound', pattern: JUMP },
      { sound: ref(1), pattern: JCGE },
      { sound: ref(2), pattern: JCGE },
    ]);
    expect(counts.skipped).toEqual([
      { sound: 'model-d/not-a-sound', reason: 'Not in the catalogue' },
      { sound: ref(1), reason: `${JCGE} is not on its list` },
      { sound: ref(2), reason: `${JCGE} cannot be its default: It is disabled` },
    ]);

    // Enabled, but ending in rests: as a riff it would come round early.
    keyed(JCGE).status = 'enabled';
    const rests = PatternSchema.parse(keyed(JCGE).pattern);
    rests.parts[0].steps.push({ on: true, notes: [] }, { on: true, notes: [] });
    keyed(JCGE).pattern = rests;
    const [{ reason }] = (await syncResearchedDefaults(lib(), [{ sound: ref(2), pattern: JCGE }]))
      .skipped;
    expect(reason).toContain('cannot end in rests');
    expect(writes()).toBe(0);
  });

  it('lets a changed batch rewrite a default the seed made, and the riff follows it', async () => {
    await syncResearchedDefaults(lib(), defaults());
    const changed = testBatch();
    const notes = changed.patterns[0].pattern;
    notes.transpose = 2;
    expect(await syncResearchedPatterns(lib(), [changed], defaults())).toMatchObject({
      updated: 1,
      edited: 0,
    });
    expect(await syncResearchedDefaults(lib(), defaults())).toMatchObject({ rewritten: 1 });
    expect(soundRow(0).phrase).toEqual(phraseOf(notes));

    // Without the list, the same patterns at their sounds' heads read as an admin's and are left alone.
    changed.patterns[0].pattern.transpose = 4;
    expect(await syncResearchedPatterns(lib(), [changed])).toMatchObject({ updated: 0, edited: 2 });
  });
});

describe('the catalogue seed, for a sound whose riff follows a researched default', () => {
  it('writes the file’s riff only on create, and leaves it out of its record', async () => {
    await syncResearchedDefaults(lib(), defaults());
    const followed = soundRow(0).phrase;
    clearWrites();
    const data = { ...sample(), followsPattern: [ref(0), ref(2)] };

    const report = await seedCatalogue(prisma(), data);
    expect(report.sounds).toMatchObject({ updated: 0 });
    expect(soundRow(0).phrase).toEqual(followed);
    expect(records.rows.get(`SOUND:${ref(0)}`)?.values).not.toHaveProperty('phrase');
    expect(records.rows.get(`SOUND:${ref(1)}`)?.values).toHaveProperty('phrase');

    // Without it, the seed puts the file's riff back: the turn-taking it prevents.
    await seedCatalogue(prisma(), sample());
    expect(soundRow(0).phrase).not.toEqual(followed);
  });

  it('still writes the file’s riff when it creates the row, which the sound’s own riff pattern is made from', async () => {
    db = catalogueTables();
    records = seedRecordTable();
    const data = {
      ...sample(),
      followsPattern: [`model-d/${String(sample().sounds[0].sounds[0].id)}`],
    };
    await seedCatalogue(prisma(), data);
    expect(soundRow(0).phrase).toEqual(sample().sounds[0].sounds[0].phrase);
  });
});
