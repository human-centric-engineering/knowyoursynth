/**
 * Researched patterns (`f-pattern-library` t-127, t-128, t-159): the research batches under the seed's `data/patterns/`, and
 * the seed that puts them on their sounds.
 *
 * First the real batches, against the real catalogue and databank data: every pattern parses and plays, every sound a
 * batch names is in the catalogue and is looked at once (a pattern, or a reason it has none) by one batch, every link
 * resolves, the rights rule's length holds, and two patterns play the notes their leads give. Then the sync, over the stateful catalogue fake seeded from Model D's real sounds:
 * a pattern goes behind the riff and never in front, a second run writes nothing, an empty batch writes nothing, and an
 * admin's pattern (edited, or made a default) is left alone.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PresetSchema } from '@/lib/app/synths/validate';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { MAX_STEPS, PatternSchema, type Pattern } from '@/lib/app/sequencer/pattern';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { loadPatternData } from '@/prisma/seeds/app-knowyoursynth/pattern-data';
import { riffKey, syncRiffPatterns, type LibraryDb } from '@/lib/app/patterns/library';
import { firstLoop, patternFacts } from '@/lib/app/patterns/library-facts';
import {
  ResearchBatchSchema,
  syncResearchedPatterns,
  type ResearchBatch,
  type ResearchedPattern,
} from '@/lib/app/patterns/library-researched';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import type { CatalogueSeedData } from '@/lib/app/catalogue/data';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import {
  catalogueTables,
  seedRecordTable,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';

const catalogue = loadCatalogueData();
const bank = loadBankData();
const batches = loadPatternData();
const patterns = batches.flatMap((b) => b.patterns);

const sounds = new Map<string, ReturnType<typeof PresetSchema.parse>>(
  catalogue.sounds.flatMap((file) =>
    file.sounds.map((s) => {
      const preset = PresetSchema.parse(s);
      return [`${file.synth}/${preset.id}`, preset];
    })
  )
);

/** The beats a pattern's chain plays through once. */
const chainBeats = (p: Pattern) => p.chain.length * firstLoop(p).beats;

describe('the research batches', () => {
  it('has the pilot, with patterns and reasons, or every check below is vacuous', () => {
    expect(batches.map((b) => b.task)).toContain('t-127');
    expect(patterns.length).toBeGreaterThan(10);
    expect(batches.flatMap((b) => b.notRecreated).length).toBeGreaterThan(0);
  });

  it('names only sounds that are in the catalogue', () => {
    const named = [
      ...patterns.flatMap((p) => p.sounds),
      ...batches.flatMap((b) => b.notRecreated.map((n) => n.sound)),
    ];
    expect(named.filter((s) => !sounds.has(s))).toEqual([]);
  });

  /** Each batch's artists and how many of their sounds the catalogue held when it was researched. */
  const rosters: [string, string[], number][] = [
    ['t-127', ['Kraftwerk', 'Depeche Mode'], 42],
    ['t-128', ['Daft Punk', 'Jean-Michel Jarre', 'Tangerine Dream'], 75],
  ];

  it('has a roster for every batch, so none goes unchecked below', () => {
    expect(batches.map((b) => b.task).sort()).toEqual(rosters.map(([task]) => task).sort());
  });

  it('places each sound in one batch at most', () => {
    const named = batches.flatMap((b) => [
      ...new Set([...b.patterns.flatMap((p) => p.sounds), ...b.notRecreated.map((n) => n.sound)]),
    ]);
    expect(named.filter((s, i) => named.indexOf(s) !== i)).toEqual([]);
  });

  it.each(rosters)(
    '%s looks at every sound by %j exactly once: one or more patterns, or a reason it has none',
    (task, artists, count) => {
      const roster = [...sounds]
        .filter(([, s]) => artists.includes(s.artist))
        .map(([k]) => k)
        .sort();
      expect(roster.length).toBe(count);
      const batch = batches.find((b) => b.task === task);
      if (!batch) throw new Error(`No batch for ${task} under data/patterns/`);
      // A sound can have its work's hook and another part of it (t-159), so it can be on more than one pattern.
      const patterned = new Set(batch.patterns.flatMap((p) => p.sounds));
      const reasoned = batch.notRecreated.map((n) => n.sound);
      // A reason beside a pattern would be stale.
      expect(reasoned.filter((s) => patterned.has(s))).toEqual([]);
      expect([...patterned, ...reasoned].sort()).toEqual(roster);
    }
  );

  it('links Inspired by only to databank rows that exist', () => {
    const songs = new Map(bank.songs.map((s) => [s.id, s]));
    const artists = new Set(bank.artists.map((a) => a.id));
    for (const p of patterns) {
      const i = p.inspiredBy;
      if (i.kind === 'work') {
        expect(songs.has(i.songId), p.key).toBe(true);
        if (i.part !== undefined) expect(songs.get(i.songId)!.parts[i.part], p.key).toBeDefined();
      }
      if (i.kind === 'artist') expect(artists.has(i.artistId), p.key).toBe(true);
    }
  });

  it('keeps every pattern playable, within the sequencer and the rights rule’s 8 bars', () => {
    for (const p of patterns) {
      const pattern = PatternSchema.parse(p.pattern);
      const loop = compileLoop(pattern, { loop: 0, rng: seededRng(1) });
      expect(loop.notes.length, p.key).toBeGreaterThan(0);
      // No note runs past the loop it is in.
      for (const [beat, , len] of loop.notes)
        expect(beat + len, p.key).toBeLessThanOrEqual(loop.beats + 1e-9);
      expect(pattern.parts[0].steps.length, p.key).toBeLessThanOrEqual(MAX_STEPS);
      expect(chainBeats(pattern), p.key).toBeLessThanOrEqual(8 * 4);
      // A batch pattern goes on its sounds whole: the same every loop.
      expect(pattern.direction, p.key).toBe('forward');
    }
  });

  it('gives a mono line to every sound whose own riff plays no chords', () => {
    for (const p of patterns)
      for (const s of p.sounds) {
        const riff = sounds.get(s)!.phrase;
        const starts = new Map<number, number>();
        for (const [beat] of riff.steps) starts.set(beat, (starts.get(beat) ?? 0) + 1);
        if (Math.max(...starts.values()) === 1)
          expect(patternFacts(p.pattern).voices, `${p.key} on ${s}`).toBe(1);
      }
  });

  it('records each pattern’s research: the work, the part, its leads and why its fidelity is what it is', () => {
    for (const p of patterns) {
      expect(p.research.leads.length, p.key).toBeGreaterThan(0);
      expect(p.research.listenedAt, p.key).toBeNull();
      // Leads are not sources (Order of trust), so nothing in the pilot can claim more than _In the style of_.
      expect(p.fidelity, p.key).toBe('in_the_style_of');
    }
  });

  it('plays the notes its leads give: the bass of “Just Can’t Get Enough”, as both leads have it', () => {
    const p = patterns.find((x) => x.key === 'researched:depeche-mode/just-cant-get-enough-bass')!;
    const pitches = compileLoop(PatternSchema.parse(p.pattern), {
      loop: 0,
      rng: seededRng(1),
    }).notes.map(([, n]) => n);
    // G G C B, G G C B, C C F E, C C C C: Songsterr track 6 and the BitMIDI file, bars 5–8, an octave up.
    expect(pitches).toEqual([43, 43, 48, 47, 43, 43, 48, 47, 48, 48, 53, 52, 48, 48, 48, 48]);
  });

  it('plays the notes its lead gives: the break figure of “Da Funk”, in both octaves the record has it', () => {
    const pitches = (key: string) =>
      compileLoop(PatternSchema.parse(patterns.find((x) => x.key === key)!.pattern), {
        loop: 0,
        rng: seededRng(1),
      }).notes.map(([, n]) => n);
    // G G' D E♭ D E♭ F G' G: Songsterr “Synths 1”, bar 71, and “Synths 3”, bar 65, two octaves apart.
    const high = pitches('researched:daft-punk/da-funk-breakdown-figure');
    expect(high).toEqual([55, 67, 62, 63, 62, 63, 65, 67, 55]);
    expect(pitches('researched:daft-punk/da-funk-breakdown-figure-low')).toEqual(
      high.map((n) => n - 24)
    );
  });

  it('plays the notes its lead gives: the main riff of “Da Funk”, now the hook rule is dropped', () => {
    const pitches = (key: string) =>
      compileLoop(PatternSchema.parse(patterns.find((x) => x.key === key)!.pattern), {
        loop: 0,
        rng: seededRng(1),
      }).notes.map(([, n]) => n);
    // G F G B♭ D, C D F B♭, A B♭ D G, A B♭: Songsterr “Main Synth Riff 1”, bars 1–4, ties merged.
    const high = pitches('researched:daft-punk/da-funk-riff');
    expect(high).toEqual([67, 65, 67, 70, 62, 60, 62, 65, 58, 57, 58, 62, 55, 57, 58]);
    expect(pitches('researched:daft-punk/da-funk-riff-low')).toEqual(high.map((n) => n - 24));
  });
});

describe('a batch file', () => {
  const one = (): ResearchedPattern => structuredClone(patterns[0]);
  const batch = (p: unknown): unknown => ({
    task: 't-1',
    researchedBy: 'a test',
    researchedAt: '2026-11-01',
    patterns: [p],
    notRecreated: [],
  });

  it('refuses a transcribed or reconstructed pattern that names no work or lists no sources', () => {
    const p = {
      ...one(),
      fidelity: 'reconstructed',
      inspiredBy: { kind: 'artist', artistId: 'kraftwerk' },
      sources: [],
    };
    const parsed = ResearchBatchSchema.safeParse(batch(p));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.at(-1))).toEqual(['inspiredBy', 'sources']);
  });

  it('refuses a tempo range that leaves out the pattern’s own tempo, and a key used twice', () => {
    const p = { ...one(), tempo: { min: 20, max: 30 } };
    expect(ResearchBatchSchema.safeParse(batch(p)).error?.issues[0].path.at(-1)).toBe('tempo');
    const twice = { ...(batch(one()) as object), patterns: [one(), one()] };
    expect(ResearchBatchSchema.safeParse(twice).error?.issues[0].message).toBe(
      'A key is used once'
    );
  });
});

describe('the loader', () => {
  it('names the file that does not parse as JSON, or does not fit the schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'patterns-'));
    writeFileSync(join(dir, 'a.json'), '{ not json');
    expect(() => loadPatternData(dir)).toThrow(/^patterns\/a\.json: /);
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ task: 'nope' }));
    expect(() => loadPatternData(dir)).toThrow(/^patterns\/a\.json: .*task/s);
  });

  it('refuses a key that another batch file already uses, naming both files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'patterns-'));
    const file = { ...batches[0], patterns: [batches[0].patterns[0]], notRecreated: [] };
    writeFileSync(join(dir, 'a.json'), JSON.stringify(file));
    expect(loadPatternData(dir)).toHaveLength(1);
    writeFileSync(join(dir, 'b.json'), JSON.stringify(file));
    expect(() => loadPatternData(dir)).toThrow(
      `patterns/b.json: ${file.patterns[0].key} is already used in patterns/a.json`
    );
  });
});

// ─── The sync ────────────────────────────────────────────────────────────────

let db: CatalogueTables;
const lib = () => db as unknown as LibraryDb;

/** Model D with its first three sounds, and the databank rows the test batch links to. */
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

/** A batch of two real pilot patterns, put on the sample's sounds: one on sounds 0 and 1, one on sound 2. */
function testBatch(): ResearchBatch {
  const [a, b] = [
    'researched:kraftwerk/the-model-counter-line',
    'researched:depeche-mode/just-cant-get-enough-bass',
  ].map((k) => structuredClone(patterns.find((p) => p.key === k)!));
  return {
    task: 't-127',
    researchedBy: 'a test',
    researchedAt: '2026-11-01',
    patterns: [
      { ...a, sounds: [ref(0), ref(1)] },
      { ...b, sounds: [ref(2)] },
    ],
    notRecreated: [],
  };
}

beforeEach(async () => {
  db = catalogueTables();
  const prisma = { ...db, catalogueSeedRecord: seedRecordTable() };
  await seedCatalogue(prisma as unknown as TenancyClient, sample());
  db.bankArtist.rows.push({ id: 'kraftwerk', name: 'Kraftwerk' });
  db.bankSong.rows.push({
    id: 'depeche-mode-just-cant-get-enough',
    title: '"Just Can’t Get Enough"',
    parts: [{ id: 'part-1', order: 0 }],
  });
  await syncRiffPatterns(lib());
  clearWrites();
});

describe('syncResearchedPatterns', () => {
  it('puts each pattern on its sounds behind the riff, so every riff stays its sound’s default', async () => {
    const counts = await syncResearchedPatterns(lib(), [testBatch()]);

    expect(counts).toEqual({
      created: 2,
      updated: 0,
      unchanged: 0,
      edited: 0,
      placed: 3,
      skipped: [],
    });
    const model = keyed('researched:kraftwerk/the-model-counter-line');
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    expect(listOf(0)).toEqual([riffOf(0).id, model.id]);
    expect(listOf(1)).toEqual([riffOf(1).id, model.id]);
    expect(listOf(2)).toEqual([riffOf(2).id, jcge.id]);
    // Its riff is untouched, so the sound still plays it.
    expect(db.synthSound.update).not.toHaveBeenCalled();
  });

  it('stores the pattern as the batch has it, AI-generated, its label from the linked row', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    const planned = testBatch().patterns[1];
    expect(PatternSchema.parse(jcge.pattern)).toEqual(planned.pattern);
    expect(jcge).toMatchObject({
      name: planned.name,
      role: 'bass_line',
      fidelity: 'in_the_style_of',
      origin: 'ai_generated',
      inspiration: 'work',
      inspiredBy: '"Just Can’t Get Enough"',
      inspiredSongId: 'depeche-mode-just-cant-get-enough',
      inspiredPartId: null,
      bpmMin: null,
      bpmMax: null,
    });
    expect(keyed('researched:kraftwerk/the-model-counter-line')).toMatchObject({
      inspiration: 'artist',
      inspiredBy: 'Kraftwerk',
      inspiredArtistId: 'kraftwerk',
    });
  });

  it('writes nothing the second time, nor for an empty batch', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    clearWrites();
    expect(await syncResearchedPatterns(lib(), [testBatch()])).toEqual({
      created: 0,
      updated: 0,
      unchanged: 2,
      edited: 0,
      placed: 0,
      skipped: [],
    });
    expect(await syncResearchedPatterns(lib(), [])).toMatchObject({ created: 0, placed: 0 });
    expect(await syncResearchedPatterns(lib(), [{ ...testBatch(), patterns: [] }])).toMatchObject({
      created: 0,
    });
    expect(writes()).toBe(0);
  });

  it('follows a changed batch, and leaves alone a pattern an admin edited or made a default', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    const model = keyed('researched:kraftwerk/the-model-counter-line');
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    // An admin edited one, and made the other sound 2's default.
    model.editedAt = new Date();
    model.name = 'An admin named it';
    const keptModel = structuredClone(model);
    const link = db.synthSoundPattern.rows.find((l) => l.patternId === jcge.id)!;
    link.order = -1;
    const keptJcge = structuredClone(jcge);
    const changed = testBatch();
    for (const p of changed.patterns) p.name = 'Renamed in the batch';
    clearWrites();

    expect(await syncResearchedPatterns(lib(), [changed])).toMatchObject({ edited: 2, updated: 0 });
    expect(model).toEqual(keptModel);
    expect(jcge).toEqual(keptJcge);
    expect(writes()).toBe(0);

    // Without the admin's hand, the batch's change lands.
    model.editedAt = null;
    expect(await syncResearchedPatterns(lib(), [changed])).toMatchObject({ updated: 1, edited: 1 });
    expect(model.name).toBe('Renamed in the batch');
  });

  it('adds a newly named sound at the end of its list, and never moves or removes a place', async () => {
    await syncResearchedPatterns(lib(), [testBatch()]);
    const before = structuredClone(db.synthSoundPattern.rows);
    const wider = testBatch();
    wider.patterns[1].sounds = [ref(2), ref(0)];
    // Taken out of the file: still in the library and on its sounds.
    wider.patterns.splice(0, 1);

    expect(await syncResearchedPatterns(lib(), [wider])).toMatchObject({ placed: 1 });
    const jcge = keyed('researched:depeche-mode/just-cant-get-enough-bass');
    expect(db.synthSoundPattern.rows.slice(0, before.length)).toEqual(before);
    expect(listOf(0).at(-1)).toBe(jcge.id);
    expect(listOf(0)[0]).toBe(riffOf(0).id);
    expect(keyed('researched:kraftwerk/the-model-counter-line')).toBeDefined();
  });

  it('skips a pattern that names a sound or a song that is not there, and says why, writing nothing for it', async () => {
    const lost = testBatch();
    lost.patterns[0].sounds = [ref(0), 'model-d/no-such-sound'];
    lost.patterns[1].inspiredBy = { kind: 'work', songId: 'no-such-song' };

    const counts = await syncResearchedPatterns(lib(), [lost]);

    expect(counts).toMatchObject({ created: 0, placed: 0 });
    expect(counts.skipped).toEqual([
      {
        key: 'researched:kraftwerk/the-model-counter-line',
        reason: 'Names model-d/no-such-sound, not in the catalogue',
      },
      {
        key: 'researched:depeche-mode/just-cant-get-enough-bass',
        reason: 'Inspired by names the song no-such-song, which is not there',
      },
    ]);
    expect(writes()).toBe(0);
  });

  it('does not create a pattern none of whose sounds has its riff yet, so it is never on no sound', async () => {
    const batch = testBatch();
    db.synthSoundPattern.rows.length = 0;
    const counts = await syncResearchedPatterns(lib(), [batch]);
    expect(counts.skipped.map((s) => s.reason)).toEqual([
      'No sound it names has its riff pattern yet',
      'No sound it names has its riff pattern yet',
    ]);
    expect(writes()).toBe(0);
  });

  it('writes nothing on an empty catalogue, skipping every pattern', async () => {
    const batch = testBatch();
    db.synthSound.rows.length = 0;
    const counts = await syncResearchedPatterns(lib(), [batch]);
    expect(counts.skipped).toHaveLength(2);
    expect(writes()).toBe(0);
  });
});
