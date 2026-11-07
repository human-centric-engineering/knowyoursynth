/**
 * The links seed data (t-199): the loader (`link-data.ts`), the unit (`006-links.ts`), and the committed files under
 * `prisma/seeds/app-knowyoursynth/data/links/`. The seed's rules are `seed.test.ts`'s.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkLinkData } from '@/lib/app/links/seed';
import {
  fileOfOwner,
  LINK_DATA_DIR,
  linkDataFiles,
  loadLinkData,
  ownerOfFile,
} from '@/prisma/seeds/app-knowyoursynth/link-data';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';
import { catalogueSynthSounds } from '@/tests/helpers/bank-db';

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function folder(files: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'kys-links-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

describe('the data layout', () => {
  it.each([
    ['instrument/moog-minimoog.json', { kind: 'instrument', id: 'moog-minimoog' }],
    ['sound/model-d/stacked-night-bass.json', { kind: 'sound', id: 'model-d/stacked-night-bass' }],
    ['song/kraftwerk-autobahn.json', { kind: 'song', id: 'kraftwerk-autobahn' }],
    ['artist/aphex-twin.json', { kind: 'artist', id: 'aphex-twin' }],
  ] as const)('%s is about %o, and back', (rel, owner) => {
    expect(ownerOfFile(rel)).toEqual(owner);
    expect(fileOfOwner(owner)).toBe(rel);
  });

  it.each(['synth/model-d.json', 'moog-minimoog.json', 'instrument/.json'])(
    '%s is outside the layout',
    (rel) => {
      expect(ownerOfFile(rel)).toBeNull();
    }
  );
});

describe('loadLinkData', () => {
  it('reads every file under the folder, nested ones too, in path order', () => {
    const dir = folder({
      'sound/model-d/stacked-night-bass.json': {
        kind: 'sound',
        id: 'model-d/stacked-night-bass',
        links: [{ url: YT, kind: 'lesson', title: 'Walk-through' }],
      },
      'instrument/moog-minimoog.json': {
        kind: 'instrument',
        id: 'moog-minimoog',
        links: [{ url: YT, kind: 'demo', title: 'Demo', ours: true }],
      },
      'notes.txt': 'not data',
    });
    expect(linkDataFiles(dir)).toEqual([
      'instrument/moog-minimoog.json',
      'sound/model-d/stacked-night-bass.json',
    ]);
    expect(loadLinkData(dir)).toEqual([
      {
        owner: { kind: 'instrument', id: 'moog-minimoog' },
        links: [{ url: YT, kind: 'demo', title: 'Demo', ours: true, order: 0, rating: null }],
      },
      {
        owner: { kind: 'sound', id: 'model-d/stacked-night-bass' },
        links: [
          { url: YT, kind: 'lesson', title: 'Walk-through', ours: false, order: 0, rating: null },
        ],
      },
    ]);
  });

  it('reads no folder as no links', () => {
    const missing = join(tmpdir(), 'kys-links-none', String(Date.now()));
    expect(linkDataFiles(missing)).toEqual([]);
    expect(loadLinkData(missing)).toEqual([]);
  });

  it.each([
    ['a file outside the layout', { 'film/x.json': [] }, /links\/film\/x\.json: not at/],
    ['a file that is not JSON', { 'instrument/x.json': '{' }, /links\/instrument\/x\.json: /],
    [
      'a link of the wrong shape',
      { 'instrument/x.json': { kind: 'instrument', id: 'x', links: [{ url: YT }] } },
      /links\/instrument\/x\.json: /,
    ],
    [
      'a bare list, the shape before the owner was named in the file',
      { 'instrument/x.json': [{ url: YT, kind: 'demo', title: 'T' }] },
      /links\/instrument\/x\.json: /,
    ],
    [
      // A file moved to another owner keeps its contents, and the runner hashes only contents: so it must say who.
      'a file naming another owner than its path does',
      { 'instrument/new-id.json': { kind: 'instrument', id: 'old-id', links: [] } },
      /links\/instrument\/new-id\.json: names instrument:old-id, not instrument:new-id/,
    ],
  ])('names the file with %s', (_, files, problem) => {
    expect(() => loadLinkData(folder(files))).toThrow(problem);
  });
});

describe('the seed unit', () => {
  it('runs after the catalogue and the databank, and re-runs when the data or the links code changes', async () => {
    const unit = (await import('@/prisma/seeds/app-knowyoursynth/006-links')).default;
    expect(unit.name).toBe('app-knowyoursynth/006-links');
    expect(unit.hashInputs).toEqual([
      ...linkDataFiles().map((f) => `data/links/${f}`),
      './link-data.ts',
      '../../../lib/app/links/seed.ts',
      '../../../lib/app/links/providers.ts',
      '../../../lib/app/links/owner-ref.ts',
      '../../../lib/security/sanitize.ts',
      '../../../lib/app/bank/data.ts',
      '../../../lib/app/sounds/data.ts',
    ]);
  });
});

describe('the committed data', () => {
  const data = loadLinkData();

  it('is there: every video curated in dev, 2026-11-07', () => {
    expect(linkDataFiles(LINK_DATA_DIR).length).toBeGreaterThanOrEqual(31);
    expect(data.reduce((n, d) => n + d.links.length, 0)).toBeGreaterThanOrEqual(1087);
  });

  it('checks: every URL in its stored form, once per owner, with a kind and a title', () => {
    expect(checkLinkData(data)).toEqual([]);
  });

  it('names only owners the seed itself writes, so no link is skipped on a fresh database', () => {
    const bank = loadBankData();
    const have = {
      instrument: new Set(bank.instruments.map((i) => i.id)),
      song: new Set(bank.songs.map((s) => s.id)),
      artist: new Set(bank.artists.map((a) => a.id)),
    };
    const sounds = catalogueSynthSounds();
    const missing = data
      .map((d) => d.owner)
      .filter((o) => {
        if (o.kind !== 'sound') return !have[o.kind].has(o.id);
        const [synth, slug] = o.id.split('/');
        return !sounds.get(synth ?? '')?.has(slug ?? '');
      });
    expect(missing).toEqual([]);
  });
});

describe('the seed unit run', () => {
  it('seeds the committed data and warns only when an owner is missing', async () => {
    const seed = await import('@/lib/app/links/seed');
    const spy = vi.spyOn(seed, 'seedLinks');
    const unit = (await import('@/prisma/seeds/app-knowyoursynth/006-links')).default;
    const logger = { info: vi.fn(), warn: vi.fn() };

    spy.mockResolvedValueOnce({ created: 3, existing: 1, missingOwners: [] });
    await unit.run({ prisma: {}, logger } as never);
    expect(spy).toHaveBeenCalledWith({}, loadLinkData());
    expect(logger.info).toHaveBeenCalledWith('Links seeded', {
      created: 3,
      existing: 1,
      missingOwners: 0,
    });
    expect(logger.warn).not.toHaveBeenCalled();

    spy.mockResolvedValueOnce({ created: 0, existing: 0, missingOwners: ['instrument:gone'] });
    await unit.run({ prisma: {}, logger } as never);
    expect(logger.warn).toHaveBeenCalledWith(
      'Links skipped: their owners are not in this database',
      {
        owners: ['instrument:gone'],
      }
    );
  });
});
