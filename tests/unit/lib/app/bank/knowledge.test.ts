/**
 * The databank in the knowledge base (`lib/app/bank/knowledge.ts`, `f-tutor-knowledge` t-58): the projection's
 * reconcile, and the meaning search over what it wrote.
 *
 * Over the seed's own rows (`tests/helpers/bank-db.ts`), with the knowledge tables a small in-memory store behind the
 * document manager's upload and delete, which is the only way the code writes them. The embedder and the vector search
 * are mocked; `npm run bank:reindex` against the dev database, with a real provider, is the owner's check.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import type { Bank } from '@/lib/app/bank/data';
import { bankDb } from '@/tests/helpers/bank-db';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

interface StoredDoc {
  id: string;
  fileName: string;
  fileHash: string;
  status: string;
  content: string;
  tags: Set<string>;
}

const state = vi.hoisted(() => {
  const db: Record<string, unknown> = {};
  return { db, docs: new Map<string, StoredDoc>(), nextId: 0 };
});

const mocks = vi.hoisted(() => ({
  availability: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  vectorSearch: vi.fn(),
}));

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/db/client', () => ({
  prisma: new Proxy({}, { get: (_t, key: string) => state.db[key] }),
}));
vi.mock('@/lib/orchestration/knowledge/embedder', () => ({
  resolveEmbeddingAvailability: mocks.availability,
}));
vi.mock('@/lib/orchestration/knowledge/document-manager', () => ({
  uploadDocument: mocks.upload,
  deleteDocument: mocks.remove,
}));
vi.mock('@/lib/orchestration/knowledge/search', () => ({
  searchKnowledgeWithEmbedding: mocks.vectorSearch,
}));

import { logger } from '@/lib/logging';
import {
  DATABANK_TAG_SLUG,
  fileNameOf,
  projectBank,
  reconcileBankKnowledge,
  refOfFileName,
  searchBankByMeaning,
} from '@/lib/app/bank/knowledge';

const TAG_ID = 'tag-databank';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

interface DocWhere {
  status?: string;
  tags?: { some: { tagId?: string; tag?: { slug: string } } };
}

/**
 * The store's documents matching the two queries the code makes: by the tag's id, or its slug. A query with no tag filter
 * gets every document, as Prisma would, so a reconcile that forgot the filter is caught.
 */
function matching(where: DocWhere = {}): StoredDoc[] {
  const some = where.tags?.some;
  return [...state.docs.values()].filter(
    (d) =>
      (!some ||
        ((some.tagId === TAG_ID || some.tag?.slug === DATABANK_TAG_SLUG) && d.tags.has(TAG_ID))) &&
      (!where.status || d.status === where.status)
  );
}
const tagged = (where: { status?: string }) =>
  matching({ ...where, tags: { some: { tagId: TAG_ID } } });

/** Point the database at `bank`, with the knowledge tables over the shared store. */
function useBank(bank: Bank = loadBankData()): void {
  state.db = {
    ...bankDb(bank),
    user: { findFirst: vi.fn().mockResolvedValue({ id: 'service-account' }) },
    knowledgeTag: { upsert: vi.fn().mockResolvedValue({ id: TAG_ID, slug: DATABANK_TAG_SLUG }) },
    aiKnowledgeDocument: {
      findMany: vi.fn(({ where }: { where?: DocWhere }) => Promise.resolve(matching(where))),
      deleteMany: vi.fn(
        ({ where }: { where: { fileName: string; fileHash: string; status: string } }) => {
          for (const d of [...state.docs.values()]) {
            if (
              d.fileName === where.fileName &&
              d.fileHash === where.fileHash &&
              d.status === where.status &&
              !d.tags.size
            ) {
              state.docs.delete(d.id);
            }
          }
          return Promise.resolve({ count: 0 });
        }
      ),
    },
    aiKnowledgeDocumentTag: {
      upsert: vi.fn(({ create }: { create: { documentId: string; tagId: string } }) => {
        state.docs.get(create.documentId)?.tags.add(create.tagId);
        return Promise.resolve(create);
      }),
    },
  };
}

/** A document someone uploaded, in the store. */
function put(doc: Partial<StoredDoc> & { fileName: string; content: string }): StoredDoc {
  const stored: StoredDoc = {
    id: `doc-${state.nextId++}`,
    fileHash: sha(doc.content),
    status: 'ready',
    tags: new Set(),
    ...doc,
  };
  state.docs.set(stored.id, stored);
  return stored;
}

const docOf = (kind: string, id: string) =>
  [...state.docs.values()].find((d) => d.fileName === `kys-databank-${kind}-${id}.md`);

beforeEach(() => {
  vi.clearAllMocks();
  state.docs.clear();
  state.nextId = 0;
  mocks.availability.mockResolvedValue('ok');
  // The document manager's own dedupe: a ready document of the same text is handed back rather than written again.
  mocks.upload.mockImplementation((content: string, fileName: string) => {
    const same = [...state.docs.values()].find(
      (d) => d.fileHash === sha(content) && d.status === 'ready'
    );
    return Promise.resolve(same ?? put({ fileName, content }));
  });
  mocks.remove.mockImplementation((id: string) => {
    state.docs.delete(id);
    return Promise.resolve();
  });
  useBank();
});

describe('projectBank', () => {
  it("writes each row's name, what it is, its text and the names it links to", () => {
    const vangelis = projectBank(loadBankData()).find((p) => p.ref.id === 'vangelis');
    expect(vangelis?.fileName).toBe('kys-databank-artists-vangelis.md');
    expect(vangelis?.content).toMatch(/^## Vangelis\n\nArtist: /);
    expect(vangelis?.content).toMatch(/\nLinked: .*Blade Runner/);
    expect(vangelis?.hash).toBe(sha(vangelis?.content ?? ''));
  });

  it('reads a file name back to its row, and nothing else', () => {
    const ref = { kind: 'instruments', id: 'minimoog-model-d', name: 'Minimoog Model D' } as const;
    expect(refOfFileName(fileNameOf(ref))).toEqual({
      kind: 'instruments',
      id: 'minimoog-model-d',
    });
    expect(refOfFileName('kys-databank-people-x.md')).toBeNull();
    expect(refOfFileName('notes.md')).toBeNull();
  });
});

describe('reconcileBankKnowledge', () => {
  it('projects every row once, tagged, and a second run writes and deletes nothing', async () => {
    const rows = projectBank(loadBankData()).length;
    expect(await reconcileBankKnowledge()).toEqual({
      status: 'done',
      written: rows,
      unchanged: 0,
      deleted: 0,
      failed: 0,
    });
    expect(tagged({})).toHaveLength(rows);

    mocks.upload.mockClear();
    expect(await reconcileBankKnowledge()).toMatchObject({
      written: 0,
      unchanged: rows,
      deleted: 0,
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('re-projects a changed row, and only that row, replacing its old document', async () => {
    await reconcileBankKnowledge();
    const before = docOf('artists', 'vangelis');

    const bank = loadBankData();
    const artist = bank.artists.find((a) => a.id === 'vangelis');
    if (!artist) throw new Error('fixture: vangelis');
    artist.summary = `${artist.summary} A changed line.`;
    useBank(bank);

    expect(await reconcileBankKnowledge()).toMatchObject({ written: 1, deleted: 1 });
    const after = docOf('artists', 'vangelis');
    expect(after?.id).not.toBe(before?.id);
    expect(after?.content).toContain('A changed line.');
    expect(state.docs.has(before?.id ?? '')).toBe(false);
  });

  it('re-projects the rows that name a renamed row', async () => {
    await reconcileBankKnowledge();
    const bank = loadBankData();
    const artist = bank.artists.find((a) => a.id === 'vangelis');
    if (!artist) throw new Error('fixture: vangelis');
    artist.name = 'Evangelos Papathanassiou';
    useBank(bank);

    const linking = projectBank(bank).filter((p) => p.content.includes('Evangelos Papathanassiou'));
    expect(linking.length).toBeGreaterThan(1);
    mocks.upload.mockClear();
    const result = await reconcileBankKnowledge();

    expect(result).toMatchObject({ written: linking.length });
    expect(mocks.upload.mock.calls.map((c) => c[1]).sort()).toEqual(
      linking.map((p) => p.fileName).sort()
    );
  });

  it("deletes a removed row's document, and re-projects the rows that linked to it", async () => {
    await reconcileBankKnowledge();
    const bank = loadBankData();
    const gone = bank.songs[bank.songs.length - 1];
    expect(docOf('songs', gone.id)).toBeDefined();
    bank.songs = bank.songs.slice(0, -1);
    useBank(bank);
    const before = new Set(state.docs.keys());

    const result = await reconcileBankKnowledge();
    expect(docOf('songs', gone.id)).toBeUndefined();
    // Each re-projected row replaced its old copy; the removed row's went with nothing in its place.
    expect(result).toMatchObject({ deleted: (result.status === 'done' ? result.written : 0) + 1 });
    expect(tagged({}).filter((d) => !before.has(d.id))).toHaveLength(
      result.status === 'done' ? result.written : -1
    );
  });

  it('deletes nothing when the bank reads empty, and warns', async () => {
    await reconcileBankKnowledge();
    const held = tagged({}).length;
    expect(held).toBeGreaterThan(0);
    for (const model of ['bankMaker', 'bankInstrument', 'bankArtist', 'bankSong']) {
      (state.db[model] as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([]);
    }

    expect(await reconcileBankKnowledge()).toEqual({ status: 'skipped', reason: 'empty bank' });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(tagged({})).toHaveLength(held);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/read no rows/));
  });

  it('never touches a document without the tag, even one named like a projection', async () => {
    const theirs = put({
      fileName: 'kys-databank-songs-not-a-row.md',
      content: 'An admin upload.',
    });
    await reconcileBankKnowledge();
    expect(state.docs.get(theirs.id)).toBe(theirs);
    expect(mocks.remove).not.toHaveBeenCalledWith(theirs.id);
  });

  it('removes a tagged document that names no row', async () => {
    await reconcileBankKnowledge();
    const stray = put({ fileName: 'kys-databank-artists-nobody.md', content: 'Gone.' });
    stray.tags.add(TAG_ID);
    expect(await reconcileBankKnowledge()).toMatchObject({ written: 0, deleted: 1 });
    expect(state.docs.has(stray.id)).toBe(false);
  });

  it('skips without throwing, and writes nothing, with no embedding provider', async () => {
    mocks.availability.mockResolvedValue('none_configured');
    expect(await reconcileBankKnowledge()).toEqual({
      status: 'skipped',
      reason: 'embedding provider: none_configured',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(state.docs.size).toBe(0);
  });

  it('keeps the old document when a changed row fails to upload, and counts it', async () => {
    await reconcileBankKnowledge();
    const before = docOf('artists', 'vangelis');
    const bank = loadBankData();
    const artist = bank.artists.find((a) => a.id === 'vangelis');
    if (!artist) throw new Error('fixture: vangelis');
    artist.summary = 'Changed.';
    useBank(bank);
    mocks.upload.mockRejectedValueOnce(new Error('provider down'));

    expect(await reconcileBankKnowledge()).toMatchObject({ written: 0, failed: 1, deleted: 0 });
    expect(docOf('artists', 'vangelis')?.id).toBe(before?.id);
  });

  it("re-projects every row when forced, which is what overwrites an admin's edit", async () => {
    await reconcileBankKnowledge();
    const rows = tagged({}).length;
    const before = docOf('artists', 'vangelis');
    expect(await reconcileBankKnowledge({ force: true })).toMatchObject({
      written: rows,
      deleted: rows,
    });
    expect(docOf('artists', 'vangelis')?.id).not.toBe(before?.id);
    expect(tagged({})).toHaveLength(rows);
  });
});

describe('searchBankByMeaning', () => {
  const chunk = (documentId: string, similarity: number) => ({
    chunk: { documentId },
    similarity,
  });

  it('searches only the tagged documents, one hit per row, best first', async () => {
    const moog = put({ fileName: 'kys-databank-makers-robert-moog.md', content: 'a' });
    const buchla = put({ fileName: 'kys-databank-makers-don-buchla.md', content: 'b' });
    moog.tags.add(TAG_ID);
    buchla.tags.add(TAG_ID);
    mocks.vectorSearch.mockResolvedValue({
      results: [chunk(moog.id, 0.9), chunk(moog.id, 0.8), chunk(buchla.id, 0.7)],
    });

    const found = await searchBankByMeaning('who pioneered modular synthesis?', { limit: 6 });
    expect(mocks.vectorSearch).toHaveBeenCalledWith(
      'who pioneered modular synthesis?',
      { documentIds: [moog.id, buchla.id] },
      12
    );
    expect(found).toEqual({
      status: 'ok',
      hits: [
        { ref: { kind: 'makers', id: 'robert-moog' }, similarity: 0.9 },
        { ref: { kind: 'makers', id: 'don-buchla' }, similarity: 0.7 },
      ],
    });
  });

  it('narrows to a kind before it searches', async () => {
    const maker = put({ fileName: 'kys-databank-makers-robert-moog.md', content: 'a' });
    const song = put({ fileName: 'kys-databank-songs-oxygene.md', content: 'b' });
    maker.tags.add(TAG_ID);
    song.tags.add(TAG_ID);
    mocks.vectorSearch.mockResolvedValue({ results: [chunk(song.id, 0.9)] });
    await searchBankByMeaning('q', { kind: 'songs', limit: 6 });
    expect(mocks.vectorSearch.mock.calls[0][1]).toEqual({ documentIds: [song.id] });
  });

  it('is unavailable, without embedding the query, when nothing is projected', async () => {
    expect(await searchBankByMeaning('q', { limit: 6 })).toEqual({
      status: 'unavailable',
      reason: 'the databank is not projected',
    });
    expect(mocks.vectorSearch).not.toHaveBeenCalled();
  });

  it('is unavailable, not thrown, when the vector search fails', async () => {
    put({ fileName: 'kys-databank-makers-robert-moog.md', content: 'a' }).tags.add(TAG_ID);
    mocks.vectorSearch.mockRejectedValue(new Error('dimension mismatch'));
    expect(await searchBankByMeaning('q', { limit: 6 })).toEqual({
      status: 'unavailable',
      reason: 'the meaning search failed',
    });
  });
});
