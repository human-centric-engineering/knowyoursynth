/**
 * The catalogue read layer: what the public API serves from the tables.
 *
 * The database is mocked (B9). Its rows are the ones the seed would write, built from the committed seed data by
 * `planCatalogue` (`synthRows()`), so the read is tested against the real shape and the real Model D content.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSynthDetail, listSynths } from '@/lib/app/catalogue/read';
import { logger } from '@/lib/logging';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';
import { synthRows } from '@/tests/helpers/synth-detail';

vi.mock('@/lib/db/client', () => ({
  prisma: {
    synth: { findMany: vi.fn(), findFirst: vi.fn() },
    synthNote: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/logging', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { prisma } = await import('@/lib/db/client');
// Model D's rows, as the seed would write them (the other synths' rows are not part of these cases).
const { stored: modelD, noteRows: notes } = synthRows('model-d');
const { sounds: storedSounds, lineage: storedLineage, ...synthRow } = modelD;
const stored = (overrides: Record<string, unknown> = {}) => ({
  ...synthRow,
  sounds: storedSounds,
  lineage: storedLineage,
  ...overrides,
});
const firstModelDSound = () => {
  const file = loadCatalogueData().sounds.find((f) => f.synth === 'model-d');
  if (!file) throw new Error('fixture: the seed data has Model D');
  return file.sounds[0];
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(notes as never);
});

describe('listSynths', () => {
  it('lists the listed synths in catalogue order, with the registry’s version and a sound count', async () => {
    vi.mocked(prisma.synth.findMany).mockResolvedValue([synthRow] as never);

    const list = await listSynths();

    expect(list).toEqual([
      {
        id: 'model-d',
        name: 'Model D',
        maker: 'Behringer',
        year: 2018,
        heritage: synthRow.heritage,
        summary: synthRow.summary,
        definitionVersion: 1,
        soundCount: 99,
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
    expect(detail?.synth).toMatchObject({ id: 'model-d', definitionVersion: 1, soundCount: 99 });
    expect(detail?.sounds).toHaveLength(99);
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

  it('is null for an id no listed synth has', async () => {
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(null);
    expect(await getSynthDetail('nope')).toBeNull();
    expect(prisma.synthNote.findMany).not.toHaveBeenCalled();
  });

  it('is null for a synth the registry cannot play, without reading the database', async () => {
    expect(await getSynthDetail('no-such-synth')).toBeNull();
    expect(prisma.synth.findFirst).not.toHaveBeenCalled();
  });

  it('validates sounds on read: one its definition rejects, or on another version, is logged and left out', async () => {
    const s = stored();
    const [broken, oldVersion] = [s.sounds[0], s.sounds[1]];
    s.sounds[0] = { ...broken, tweaks: [{ id: 'osc9.wave', try: 'x', hear: 'y' }] };
    s.sounds[1] = { ...oldVersion, definitionVersion: 2 };
    vi.mocked(prisma.synth.findFirst).mockResolvedValue(s as never);

    const detail = await getSynthDetail('model-d');

    expect(detail?.sounds).toHaveLength(97);
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
