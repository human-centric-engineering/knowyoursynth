/**
 * The catalogue read layer: what the public API serves from the tables.
 *
 * The database is mocked (B9). Its rows are the ones the seed would write, built from the committed seed data by
 * `planCatalogue` (`synthRows()`), so the read is tested against the real shape and the real Model D content.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSynthDetail, listSoundNames, listSynths } from '@/lib/app/catalogue/read';
import { logger } from '@/lib/logging';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import { synthRows } from '@/tests/helpers/synth-detail';
import { importPhrase } from '@/lib/app/sequencer/import';
import type { Phrase } from '@/lib/app/synths/contract';
import { bankDb } from '@/tests/helpers/bank-db';
import {
  summarisePublicLinks,
  summariseSongLinks,
  summariseSoundLinks,
} from '@/lib/app/links/read';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    synth: { findMany: vi.fn(), findFirst: vi.fn() },
    synthSound: { findMany: vi.fn() },
    synthNote: { findMany: vi.fn() },
    bankInstrument: { findMany: vi.fn() },
    bankSong: { findMany: vi.fn() },
  },
}));
// The links read layer has its own tests (`tests/unit/lib/app/links/read.test.ts`); here, only that it is asked.
vi.mock('@/lib/app/links/read', () => ({
  summarisePublicLinks: vi.fn(),
  summariseSoundLinks: vi.fn(),
  summariseSongLinks: vi.fn(),
}));
vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { prisma } = await import('@/lib/db/client');
/** The databank's rows, for each synth's "Heard on". */
const bank = bankDb();
// Model D's rows, as the seed would write them (the other synths' rows are not part of these cases).
const { stored: modelD, noteRows: notes } = synthRows('model-d');
const { sounds: storedSounds, lineage: storedLineage, ...synthRow } = modelD;
const stored = (overrides: Record<string, unknown> = {}) => ({
  ...synthRow,
  sounds: storedSounds,
  lineage: storedLineage,
  bankInstruments: [{ instrument: { id: 'moog-minimoog', name: 'Minimoog Model D' } }],
  ...overrides,
});
const firstModelDSound = () => {
  const file = loadCatalogueData().sounds.find((f) => f.synth === 'model-d');
  if (!file) throw new Error('fixture: the seed data has Model D');
  return file.sounds[0];
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.bankInstrument.findMany).mockImplementation(
    bank.bankInstrument.findMany as never
  );
  vi.mocked(prisma.bankSong.findMany).mockImplementation(bank.bankSong.findMany as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(notes as never);
  vi.mocked(summarisePublicLinks).mockResolvedValue({ count: 0, kinds: [] });
  vi.mocked(summariseSoundLinks).mockResolvedValue({});
  vi.mocked(summariseSongLinks).mockResolvedValue(new Map());
});

describe('listSynths', () => {
  it('lists the listed synths in catalogue order, with their design, the registry’s version and a sound count', async () => {
    vi.mocked(prisma.synth.findMany).mockResolvedValue([
      { ...synthRow, design: 'FAITHFUL' },
    ] as never);

    const list = await listSynths();

    expect(list).toEqual([
      {
        id: 'model-d',
        name: 'Model D',
        maker: 'Behringer',
        year: 2018,
        heritage: synthRow.heritage,
        summary: synthRow.summary,
        design: 'faithful',
        definitionVersion: 1,
        soundCount: 200,
      },
    ]);
    expect(prisma.synth.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { listed: true },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      })
    );
  });

  it('leaves out a listed synth the registry cannot play, and says so', async () => {
    vi.mocked(prisma.synth.findMany).mockResolvedValue([
      synthRow,
      { ...synthRow, id: 'no-such-synth', name: 'No Such Synth' },
    ] as never);

    const list = await listSynths();

    expect(list.map((s) => s.id)).toEqual(['model-d']);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('no definition'), {
      synthId: 'no-such-synth',
    });
  });
});

describe('getSynthDetail', () => {
  it('serves every sound, the lineage and the notes for a listed synth', async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored() as never);

    const detail = await getSynthDetail('model-d');

    expect(prisma.synth.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'model-d', listed: true } })
    );
    expect(detail?.synth).toMatchObject({ id: 'model-d', definitionVersion: 1, soundCount: 200 });
    expect(detail?.sounds).toHaveLength(200);
    const first = firstModelDSound();
    expect(detail?.sounds[0]).toMatchObject({ id: first.id, name: first.name, version: 1 });
    expect(detail?.lineage?.title).toBe('From the Moog modular to the Model D');
    expect(detail?.lineage?.timeline).toHaveLength(9);
    expect(detail?.lineage).not.toHaveProperty('users');
    expect(Object.keys(detail?.notes.unusual ?? {})).toHaveLength(38);
    expect(detail?.notes.unusual['mix.ext']).toMatch(/headphone socket/);
    expect(detail?.notes.limits.intro).toMatch(/^Every control in the signal path/);
    expect(detail?.notes.limits.items.map((l) => l.title)).toEqual([
      'The lower VOLUME knob',
      'MIDI IN and MIDI THRU',
    ]);
    expect(detail?.notes.limits.shared).toHaveLength(5);
    expect(prisma.synthNote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ synthId: 'model-d' }, { synthId: null, kind: 'LIMIT' }] },
      })
    );
  });

  it("carries its instruments' videos and links, counted, for the section under the panel", async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored() as never);
    const links = { count: 12, kinds: ['demo' as const, 'review' as const, 'lesson' as const] };
    vi.mocked(summarisePublicLinks).mockResolvedValue(links);

    const detail = await getSynthDetail('model-d');

    expect(summarisePublicLinks).toHaveBeenCalledWith({ target: 'synth', id: 'model-d' });
    expect(detail?.links).toEqual(links);
  });

  it("carries each library sound's videos and links, counted, by slug", async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored() as never);
    const soundLinks = { 'fat-bass': { count: 2, kinds: ['original' as const] } };
    vi.mocked(summariseSoundLinks).mockResolvedValue(soundLinks);

    const detail = await getSynthDetail('model-d');

    expect(summariseSoundLinks).toHaveBeenCalledWith('model-d');
    expect(detail?.soundLinks).toEqual(soundLinks);
  });

  it('names the databank instruments it models, for a link suggested under its panel', async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(
      stored({
        bankInstruments: [
          { instrument: { id: 'arp-odyssey', name: 'ARP Odyssey' } },
          { instrument: { id: 'moog-minimoog', name: 'Minimoog Model D' } },
        ],
      }) as never
    );

    const detail = await getSynthDetail('model-d');

    expect(prisma.synth.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          bankInstruments: {
            select: { instrument: { select: { id: true, name: true } } },
            orderBy: { instrumentId: 'asc' },
          },
        }),
      })
    );
    expect(detail?.instruments).toEqual([
      { id: 'arp-odyssey', name: 'ARP Odyssey' },
      { id: 'moog-minimoog', name: 'Minimoog Model D' },
    ]);
  });

  it('is null for an id no listed synth has', async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(null);
    expect(await getSynthDetail('nope')).toBeNull();
    expect(prisma.synthNote.findMany).not.toHaveBeenCalled();
  });

  it('is null for a synth the registry cannot play, without reading the database', async () => {
    expect(await getSynthDetail('no-such-synth')).toBeNull();
    expect(prisma.synth.findFirst).not.toHaveBeenCalled();
  });

  it('names each sound’s riff for its default pattern: the first enabled one that can be a riff (t-224)', async () => {
    const s = stored();
    const riff = (status: string, name: string, phrase: unknown, sources: unknown = []) => ({
      pattern: { status, name, pattern: importPhrase(phrase as Phrase), sources },
    });
    const [a, b] = [s.sounds[0], s.sounds[1]];
    // a disabled pattern ahead of the default is passed over
    s.sounds[0] = {
      ...a,
      patterns: [
        riff('disabled', 'Put away', a.phrase),
        riff('enabled', 'Rolling eighths', a.phrase),
      ],
    };
    // a sound with nothing that can be its default carries no name for its riff
    s.sounds[1] = { ...b, patterns: [riff('disabled', 'Put away', b.phrase)] };
    // a row that no longer parses is no default, as the sound's patterns are served: the next leads
    const c = s.sounds[2];
    s.sounds[2] = {
      ...c,
      patterns: [
        riff('enabled', 'Broken', c.phrase, 'not a list'),
        riff('enabled', 'Next up', c.phrase),
      ],
    };
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(s as never);

    const detail = await getSynthDetail('model-d');

    expect(detail?.sounds[0].riffName).toBe('Rolling eighths');
    expect(detail?.sounds[1]).not.toHaveProperty('riffName');
    expect(detail?.sounds[2].riffName).toBe('Next up');
    // read as the sound's patterns are: in their order, enabled only
    expect(prisma.synth.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          sounds: expect.objectContaining({
            include: {
              patterns: expect.objectContaining({
                where: { pattern: { status: 'enabled' } },
                orderBy: [{ order: 'asc' }, { patternId: 'asc' }],
              }),
            },
          }),
        }),
      })
    );
  });

  it('validates sounds on read: one its definition rejects, or on another version, is logged and left out', async () => {
    const s = stored();
    const [broken, oldVersion] = [s.sounds[0], s.sounds[1]];
    s.sounds[0] = { ...broken, tweaks: [{ id: 'osc9.wave', try: 'x', hear: 'y' }] };
    s.sounds[1] = { ...oldVersion, definitionVersion: 2 };
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(s as never);

    const detail = await getSynthDetail('model-d');

    expect(detail?.sounds).toHaveLength(198);
    expect(detail?.sounds.map((x) => x.id)).not.toContain(broken.slug);
    expect(detail?.sounds.map((x) => x.id)).not.toContain(oldVersion.slug);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('fails validation'),
      expect.objectContaining({ sound: broken.slug })
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('definition version'),
      expect.objectContaining({ sound: oldVersion.slug, version: 2, current: 1 })
    );
  });

  it('leaves out an unusual note on something the synth no longer has, and says so', async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored() as never);
    vi.mocked(prisma.synthNote.findMany).mockResolvedValue([
      ...notes,
      { kind: 'UNUSUAL', synthId: 'model-d', target: 'osc9.wave', title: null, text: 'Gone.' },
    ] as never);

    const detail = await getSynthDetail('model-d');

    expect(Object.keys(detail?.notes.unusual ?? {})).toHaveLength(38);
    expect(detail?.notes.unusual).not.toHaveProperty('osc9.wave');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('unusual note'), {
      synthId: 'model-d',
      target: 'osc9.wave',
    });
  });

  it('serves no lineage when the stored one is malformed, and none when there is none', async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValueOnce(
      stored({ lineage: { ...storedLineage, timeline: [{ year: 1970 }] } }) as never
    );
    expect((await getSynthDetail('model-d'))?.lineage).toBeNull();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('lineage is malformed'),
      expect.any(Object)
    );

    vi.mocked(prisma.synth.findFirst).mockResolvedValueOnce(stored({ lineage: null }) as never);
    expect((await getSynthDetail('model-d'))?.lineage).toBeNull();
  });

  it('keeps a lineage’s players and caveat when it has them', async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(
      stored({
        lineage: { ...storedLineage, users: ['Jan Hammer'], note: 'Not a full list.' },
      }) as never
    );
    const detail = await getSynthDetail('model-d');
    expect(detail?.lineage).toMatchObject({ users: ['Jan Hammer'], note: 'Not a full list.' });
  });
});

describe('getSynthDetail heardArtists', () => {
  it("names the databank artists Model D's records credit, for their About links", async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored() as never);
    const lineage = (await getSynthDetail('model-d'))?.lineage;
    const credited = new Set((lineage?.heard ?? []).flatMap((h) => h.artists));
    expect(credited.size).toBeGreaterThan(0);
    expect(new Set(lineage?.heardArtists?.map((a) => a.id))).toEqual(credited);
  });
});

describe('getSynthDetail Heard on links', () => {
  it('counts the links of every record on the list, and puts them on the rows that have any', async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored() as never);
    const baseline = (await getSynthDetail('model-d'))?.lineage?.heard ?? [];
    expect(baseline.length).toBeGreaterThan(1);
    const [first, second] = baseline;
    const counted = { count: 2, kinds: ['original' as const, 'lesson' as const] };
    vi.mocked(summariseSongLinks).mockResolvedValue(new Map([[first.song, counted]]));

    const heard = (await getSynthDetail('model-d'))?.lineage?.heard ?? [];

    expect(summariseSongLinks).toHaveBeenLastCalledWith(baseline.map((h) => h.song));
    expect(heard.find((h) => h.song === first.song)?.links).toEqual(counted);
    // A record with none carries no count, so it shows no button.
    expect(heard.find((h) => h.song === second.song)).not.toHaveProperty('links');
  });
});

describe('listSoundNames', () => {
  it("asks for the listed synths' sounds only, and files their names by synth and sound", async () => {
    const version = (await import('@/lib/app/synths/defs')).getSynthDef('model-d')?.version;
    vi.mocked(prisma.synthSound.findMany).mockResolvedValue([
      { synthId: 'model-d', slug: 'fat-bass', name: 'Fat bass', definitionVersion: version },
      { synthId: 'model-d', slug: 'wobble', name: 'Wobble lead', definitionVersion: version },
    ] as never);

    expect(await listSoundNames()).toEqual({
      'model-d': { 'fat-bass': 'Fat bass', wobble: 'Wobble lead' },
    });
    const [args] = vi.mocked(prisma.synthSound.findMany).mock.calls[0] as [{ where: unknown }];
    expect(args.where).toEqual({ synth: { listed: true } });
  });

  it('leaves out a sound made on a definition version the registry does not have, or a synth it lacks', async () => {
    vi.mocked(prisma.synthSound.findMany).mockResolvedValue([
      { synthId: 'model-d', slug: 'old', name: 'Old', definitionVersion: -1 },
      { synthId: 'no-such-synth', slug: 'x', name: 'X', definitionVersion: 1 },
    ] as never);
    expect(await listSoundNames()).toEqual({});
  });
});
