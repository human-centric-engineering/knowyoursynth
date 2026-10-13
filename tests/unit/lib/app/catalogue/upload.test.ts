/**
 * Uploading one synth's content (`f-catalogue-admin`, t-33): the check and the write, against the small stateful fake
 * of the catalogue tables, starting from what the seed leaves for Model D's real data.
 *
 * Pins:
 * - a file is checked whole before anything is written: Zod first, then the seed's planning (`validatePreset` on the
 *   definition version, notes against real targets), every problem named;
 * - a synth with no definition is refused, saying adding one is developer work;
 * - the write creates, updates, leaves alone and skips edited rows, sets `editedAt` on what it writes, never deletes,
 *   and a re-upload writes nothing;
 * - the body reader takes JSON only and refuses past its limit, whatever the header says.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mockPrisma = vi.hoisted(() => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

import {
  catalogueTables,
  seedRecordTable,
  type CatalogueTables,
} from '@/tests/helpers/catalogue-db';
import { seedCatalogue } from '@/lib/app/catalogue/seed';
import {
  checkSynthContent,
  readJsonBody,
  uploadStorageKey,
  writeSynthContent,
} from '@/lib/app/catalogue/upload';
import { Prisma } from '@prisma/client';
import { ValidationError } from '@/lib/api/errors';
import {
  MAX_CONTENT_BYTES,
  type CatalogueSeedData,
  type SynthContent,
} from '@/lib/app/catalogue/data';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { loadCatalogueData } from '@/prisma/seeds/app-knowyoursynth/catalogue-data';

const real = loadCatalogueData();
const isModelD = (f: { synth: string }) => f.synth === 'model-d';
const modelDSounds = real.sounds.find(isModelD)!;
const modelDLineage = real.lineage.find(isModelD)!;
const modelDNotes = real.notes.find(isModelD)!;

/** Model D seeded with its first three sounds, lineage and notes. */
function sample(): CatalogueSeedData {
  const data = structuredClone(real);
  data.listing.synths = [{ id: 'model-d', order: 0, listed: true }];
  data.sounds = [{ ...modelDSounds, sounds: modelDSounds.sounds.slice(0, 3) }];
  data.lineage = [modelDLineage];
  data.notes = [modelDNotes];
  return data;
}

/** Model D's content as an upload: its first `n` sounds, lineage and notes. */
function content(n = 3): SynthContent {
  const { synth: _s, ...lineage } = structuredClone(modelDLineage);
  const { synth: _n, ...notes } = structuredClone(modelDNotes);
  return {
    synth: 'model-d',
    version: modelDSounds.version,
    sounds: structuredClone(modelDSounds.sounds.slice(0, n)) as SynthContent['sounds'],
    lineage,
    notes,
  };
}

let db: CatalogueTables;
const writes = () =>
  Object.values(db).reduce(
    (n, t) =>
      n + t.create.mock.calls.length + t.update.mock.calls.length + t.updateMany.mock.calls.length,
    0
  );
const rowCount = () => Object.values(db).reduce((n, t) => n + t.rows.length, 0);

/** Check then write, as the route does. */
const upload = (file: unknown, id = 'model-d') =>
  writeSynthContent(id, checkSynthContent(id, JSON.stringify(file)).rows);

function refusal(fn: () => unknown): {
  message: string;
  errors: { path: string; message: string }[];
} {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    const e = err as ValidationError;
    return {
      message: e.message,
      errors: (e.details?.errors ?? []) as { path: string; message: string }[],
    };
  }
  throw new Error('expected a refusal');
}

beforeEach(async () => {
  vi.clearAllMocks();
  db = catalogueTables();
  Object.assign(mockPrisma, db, {
    catalogueSeedRecord: seedRecordTable(),
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
    $queryRaw: vi.fn(async () => []),
  });
  await seedCatalogue(mockPrisma as unknown as TenancyClient, sample());
  for (const t of Object.values(db)) {
    t.create.mockClear();
    t.update.mockClear();
    t.updateMany.mockClear();
  }
});

describe('checkSynthContent', () => {
  it('plans a valid file into rows for the synth', () => {
    const { def, rows } = checkSynthContent('model-d', JSON.stringify(content(5)));

    expect(def.id).toBe('model-d');
    expect(rows.sounds.map((s) => s.slug)).toEqual(
      modelDSounds.sounds.slice(0, 5).map((s) => s.id)
    );
    expect(rows.lineage).toHaveLength(1);
    expect(rows.notes.length).toBeGreaterThan(1);
  });

  it('refuses a synth with no definition, saying adding a synth is developer work', () => {
    const { errors } = refusal(() =>
      checkSynthContent('not-a-synth', JSON.stringify({ ...content(), synth: 'not-a-synth' }))
    );

    expect(errors).toEqual([
      { path: 'synth', message: expect.stringContaining('adding a synth is developer work') },
    ]);
  });

  it('refuses text that is not JSON', () => {
    expect(refusal(() => checkSynthContent('model-d', '{ not json')).errors).toEqual([
      { path: '', message: 'The file is not valid JSON' },
    ]);
  });

  it('refuses a file that does not fit the schema, naming each place, before planning anything', () => {
    const file = { ...content(), extra: true, version: 0 };

    const { errors } = refusal(() => checkSynthContent('model-d', JSON.stringify(file)));

    expect(errors.map((e) => e.path)).toEqual(expect.arrayContaining(['', 'version']));
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('names every problem across sounds and notes at once', () => {
    const file = content(3);
    const [a, b] = file.sounds;
    a.tweaks = [{ ...a.tweaks[0], id: 'not-a-control' }];
    b.id = 'Bad Id';
    file.notes!.unusual.push({ target: 'no-such-jack', text: 'x' });

    const { message, errors } = refusal(() => checkSynthContent('model-d', JSON.stringify(file)));

    expect(message).toMatch(/Nothing was written/);
    const text = errors.map((e) => `${e.path} ${e.message}`).join('\n');
    expect(text).toContain(a.id);
    expect(text).toContain('not-a-control');
    expect(text).toContain('Bad Id is not a usable id');
    expect(text).toContain('no-such-jack');
  });

  it('refuses a file made on another definition version', () => {
    const { errors } = refusal(() =>
      checkSynthContent('model-d', JSON.stringify({ ...content(), version: 99 }))
    );

    expect(errors.map((e) => e.message).join()).toContain('definition version 99');
  });

  it('refuses a file for a different synth than the one uploaded to', () => {
    const { errors } = refusal(() =>
      checkSynthContent('tb-303', JSON.stringify({ ...content(), sounds: [] }))
    );

    expect(errors).toContainEqual({
      path: 'synth',
      message: 'The file is for model-d, not tb-303',
    });
  });
});

describe('writeSynthContent', () => {
  it('adds new sounds after the last, and leaves rows that already hold the file alone', async () => {
    const before = rowCount();

    const report = await upload(content(5));

    expect(report.sounds).toEqual({ created: 2, updated: 0, unchanged: 3, edited: 0 });
    expect(report.lineage).toEqual({ created: 0, updated: 0, unchanged: 1, edited: 0 });
    expect(report.notes.unchanged).toBeGreaterThan(0);
    expect(report.notes.created + report.notes.updated + report.notes.edited).toBe(0);
    expect(rowCount()).toBe(before + 2);
    const added = db.synthSound.rows.filter((r) => r.editedAt);
    expect(added.map((r) => [r.slug, r.order])).toEqual([
      [modelDSounds.sounds[3].id, 3],
      [modelDSounds.sounds[4].id, 4],
    ]);
  });

  it('writes nothing on a re-upload of the same file', async () => {
    await upload(content(5));
    for (const t of Object.values(db)) {
      t.create.mockClear();
      t.update.mockClear();
    }

    const report = await upload(content(5));

    expect(writes()).toBe(0);
    expect(report.sounds).toEqual({ created: 0, updated: 0, unchanged: 5, edited: 0 });
  });

  it('updates a row nobody edited, marking it edited, and keeps its place', async () => {
    const file = content(3);
    file.sounds[1].blurb = 'A new blurb';
    const row = () => db.synthSound.rows.find((r) => r.slug === file.sounds[1].id)!;
    const order = row().order;
    expect(row().editedAt).toBeNull();

    const report = await upload(file);

    expect(report.sounds).toEqual({ created: 0, updated: 1, unchanged: 2, edited: 0 });
    expect(row().blurb).toBe('A new blurb');
    expect(row().editedAt).toBeInstanceOf(Date);
    expect(row().order).toBe(order);
  });

  it('skips a row an admin edited, and leaves it as the admin left it', async () => {
    const file = content(3);
    const slug = file.sounds[0].id;
    const row = db.synthSound.rows.find((r) => r.slug === slug)!;
    row.blurb = 'The admin’s blurb';
    row.editedAt = new Date('2026-10-01');
    file.sounds[0].blurb = 'The file’s blurb';
    const lineage = db.synthLineage.rows[0];
    lineage.intro = 'The admin’s intro';
    lineage.editedAt = new Date('2026-10-01');
    file.lineage!.intro = 'The file’s intro';

    const report = await upload(file);

    expect(report.sounds).toEqual({ created: 0, updated: 0, unchanged: 2, edited: 1 });
    expect(report.lineage).toEqual({ created: 0, updated: 0, unchanged: 0, edited: 1 });
    expect(row.blurb).toBe('The admin’s blurb');
    expect(lineage.intro).toBe('The admin’s intro');
    expect(writes()).toBe(0);
  });

  it('skips a row an admin edited after the upload read it, rather than overwriting the edit', async () => {
    const file = content(3);
    const slug = file.sounds[0].id;
    const row = db.synthSound.rows.find((r) => r.slug === slug)!;
    file.sounds[0].blurb = 'The file’s blurb';
    // The upload reads the row unedited; the admin's edit lands before the upload writes it.
    const read = db.synthSound.findMany.getMockImplementation()!;
    db.synthSound.findMany.mockImplementationOnce(async (args) => {
      const rows = await read(args);
      Object.assign(row, { blurb: 'The admin’s blurb', editedAt: new Date('2026-10-13') });
      return rows;
    });

    const report = await upload(file);

    expect(report.sounds).toEqual({ created: 0, updated: 0, unchanged: 2, edited: 1 });
    expect(row.blurb).toBe('The admin’s blurb');
  });

  it('counts an edited row that already holds the file as unchanged', async () => {
    const row = db.synthSound.rows[0];
    row.editedAt = new Date('2026-10-01');

    const report = await upload(content(3));

    expect(report.sounds).toEqual({ created: 0, updated: 0, unchanged: 3, edited: 0 });
  });

  it('deletes nothing when the file has fewer rows than the tables', async () => {
    const before = rowCount();
    const file = { ...content(1), notes: undefined, lineage: undefined };

    const report = await upload(file);

    expect(rowCount()).toBe(before);
    expect(report.sounds.unchanged).toBe(1);
    expect(report.lineage).toEqual({ created: 0, updated: 0, unchanged: 0, edited: 0 });
  });

  it('places new sounds by their file position on a synth with none yet', async () => {
    db.synthSound.rows.splice(0);

    await upload(content(2));

    expect(db.synthSound.rows.map((r) => r.order)).toEqual([0, 1]);
  });

  it('refuses with a conflict when an admin created one of its rows meanwhile', async () => {
    db.synthNote.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      })
    );
    // The upload reads no notes, so it creates them; the first create meets a row made since.
    db.synthNote.rows.splice(0);

    await expect(upload(content(3))).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('Upload it again'),
    });
  });

  it('refuses, having written nothing, when the catalogue has no such synth', async () => {
    db.synth.rows.splice(0);

    await expect(upload(content(3))).rejects.toMatchObject({ status: 404 });
    expect(writes()).toBe(0);
  });
});

describe('readJsonBody', () => {
  const req = (body: string, headers: Record<string, string> = {}) =>
    new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    }) as unknown as NextRequest;

  it('returns the body text', async () => {
    await expect(readJsonBody(req('{"a":1}'))).resolves.toBe('{"a":1}');
  });

  it('refuses another content type', async () => {
    await expect(readJsonBody(req('a', { 'Content-Type': 'text/plain' }))).rejects.toMatchObject({
      status: 415,
    });
  });

  it('refuses a body past the limit as it reads, with no length declared', async () => {
    await expect(readJsonBody(req('x'.repeat(101)), 100)).rejects.toMatchObject({ status: 413 });
    await expect(readJsonBody(req('x'.repeat(100)), 100)).resolves.toHaveLength(100);
  });

  it('refuses a declared length past the limit without reading', async () => {
    // `fetch` drops a hand-set Content-Length, so the request is built by hand.
    const getReader = vi.fn();
    const declared = {
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': String(MAX_CONTENT_BYTES + 1),
      }),
      body: { getReader },
    } as unknown as NextRequest;

    await expect(readJsonBody(declared)).rejects.toMatchObject({ status: 413 });
    expect(getReader).not.toHaveBeenCalled();
  });
});

describe('uploadStorageKey', () => {
  it('keeps each upload under its synth, uniquely', () => {
    const at = new Date('2026-10-13T10:00:00.000Z');
    const a = uploadStorageKey('model-d', at);

    expect(a).toMatch(/^catalogue-uploads\/model-d\/2026-10-13T10-00-00-000Z-[0-9a-f-]{36}\.json$/);
    expect(uploadStorageKey('model-d', at)).not.toBe(a);
  });
});
