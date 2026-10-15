/**
 * Unit Tests: the databank's admin API (`f-databank` t-36).
 *
 * Real routes, real `withAdminAuth`, the real `lib/app/bank/admin.ts`, read layer and seed, over a stateful fake of
 * the databank's tables that starts as the seed leaves the committed data (`tests/helpers/bank-store.ts`). Pins:
 *
 * - every route is admin only;
 * - a save is audited with what changed and marks the row edited, and the public read layer serves it;
 * - a save that changes nothing writes and audits nothing;
 * - a save that would break a reference `checkBank` checks is refused, naming it, and writes nothing: a part naming an
 *   unknown instrument, a `sounds` preset the synth does not have, an unknown original;
 * - a removal something still points at is refused with what points at it; otherwise it is recorded and audited;
 * - a reseed leaves an edited row as the admin left it, and does not bring a removed one back.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';

const mockEnv = vi.hoisted(() => ({ TENANCY_MODE: 'single' }));
vi.mock('@/lib/env', () => ({ env: mockEnv }));

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: mockGetSession } } }));
vi.mock('next/headers', () => ({ headers: vi.fn(() => Promise.resolve(new Headers())) }));

const mockPrisma = vi.hoisted((): Record<string, unknown> => ({}));
vi.mock('@/lib/db/client', () => ({ prisma: mockPrisma }));

const mockLogAdminAction = vi.hoisted(() => vi.fn());
vi.mock('@/lib/orchestration/audit/admin-audit-logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orchestration/audit/admin-audit-logger')>()),
  logAdminAction: mockLogAdminAction,
}));

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('@/lib/api/context', () => ({ getRouteLogger: vi.fn(async () => mockLog) }));
vi.mock('@/lib/logging', () => ({ logger: mockLog }));

import { GET as getList, POST as postRow } from '@/app/api/v1/admin/bank/[kind]/route';
import {
  DELETE as deleteRow,
  GET as getRow,
  PUT as putRow,
} from '@/app/api/v1/admin/bank/[kind]/[id]/route';
import { createMockAuthSession } from '@/tests/helpers/auth';
import { bankStore, type BankStore } from '@/tests/helpers/bank-store';
import { getBankDetail, loadBank } from '@/lib/app/bank/read';
import { heardFor } from '@/lib/app/bank/joins';
import { seedBank } from '@/lib/app/bank/seed';
import type { TenancyClient } from '@/lib/db/tenancy-extension';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

function session(role: 'USER' | 'ADMIN') {
  const base = createMockAuthSession();
  return {
    ...base,
    session: { ...base.session, activeOrgId: INSTALL_ORG_ID },
    user: { ...base.user, role },
  };
}

type Row = Record<string, unknown>;

function request(method: string, path: string, body?: unknown) {
  return new Request(`http://localhost/api/v1/admin/bank/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as NextRequest;
}
const ctx = <P extends Record<string, string>>(params: P) => ({ params: Promise.resolve(params) });

async function json(res: Response) {
  return JSON.parse(await res.text()) as {
    success: boolean;
    data?: Row;
    error?: { code: string; message: string; details?: { errors?: { message: string }[] } };
  };
}
const problems = async (res: Response) =>
  ((await json(res)).error?.details?.errors ?? []).map((e) => e.message);
const auditCalls = () =>
  mockLogAdminAction.mock.calls.map(
    ([e]) =>
      e as {
        action: string;
        entityType: string;
        entityId: string;
        entityName: string;
        changes: Row;
      }
  );

let store: BankStore;
const row = (table: string, id: string) => store.tables[table].find((r) => r.id === id);

const BACH = 'wendy-carlos-switched-on-bach';

/** A song's body for PUT, from what GET returns, with `change` applied. */
async function songBody(id: string, change: (s: Row) => Row) {
  const { data } = await json(
    await getRow(request('GET', `songs/${id}`), ctx({ kind: 'songs', id }))
  );
  const { id: _id, ...song } = data?.row as Row;
  return change(song);
}

beforeEach(() => {
  vi.clearAllMocks();
  store = bankStore();
  for (const k of Object.keys(mockPrisma)) delete mockPrisma[k];
  Object.assign(mockPrisma, store.client, {
    orgMembership: {
      findUnique: vi.fn(async () => ({ role: 'OWNER', org: { status: 'ACTIVE' } })),
    },
    aiApiKey: { findFirst: vi.fn(async () => null), update: vi.fn() },
  });
  mockGetSession.mockResolvedValue(session('ADMIN'));
});

describe('admin only', () => {
  it('refuses a signed-in user who is not an admin, on reads and writes, and writes nothing', async () => {
    mockGetSession.mockResolvedValue(session('USER'));
    const responses = [
      await getList(request('GET', 'makers'), ctx({ kind: 'makers' })),
      await postRow(request('POST', 'makers', { id: 'x' }), ctx({ kind: 'makers' })),
      await getRow(request('GET', 'artists/devo'), ctx({ kind: 'artists', id: 'devo' })),
      await putRow(request('PUT', 'artists/devo', {}), ctx({ kind: 'artists', id: 'devo' })),
      await deleteRow(request('DELETE', 'songs/x'), ctx({ kind: 'songs', id: BACH })),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(store.writes).toEqual([]);
  });

  it('refuses a kind the databank does not have', async () => {
    const res = await getList(request('GET', 'synths'), ctx({ kind: 'synths' }));
    expect(res.status).toBe(400);
  });
});

describe('GET', () => {
  it('lists every row of a kind by name, each from the seed until an admin saves it', async () => {
    const { data } = await json(await getList(request('GET', 'makers'), ctx({ kind: 'makers' })));
    const list = data as unknown as { id: string; name: string; editedAt: string | null }[];
    expect(list).toHaveLength(50);
    const names = list.map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(list.every((m) => m.editedAt === null)).toBe(true);
  });

  it('lists each kind with a detail line', async () => {
    const list = async (kind: string) =>
      (await json(await getList(request('GET', kind), ctx({ kind })))).data as unknown as {
        id: string;
        detail: string;
      }[];
    expect((await list('instruments')).find((r) => r.id === 'moog-minimoog')?.detail).toMatch(
      /^Moog.* · 19/
    );
    expect((await list('artists')).find((r) => r.id === 'devo')?.detail).toBe('group');
    expect((await list('songs')).find((r) => r.id === BACH)?.detail).toBe('album · 1968');
  });

  it("returns a row in the files' shape, and a member's groups beside it rather than in it", async () => {
    const res = await getRow(
      request('GET', 'artists/vince-clarke'),
      ctx({ kind: 'artists', id: 'vince-clarke' })
    );
    const { data } = await json(res);
    expect(data?.row).toMatchObject({ id: 'vince-clarke', name: 'Vince Clarke' });
    expect(data?.row).not.toHaveProperty('memberOf');
    expect(data?.memberOf).toContain('depeche-mode');
    expect(data?.editedAt).toBeNull();
  });

  it('is a 404 for a row that is not there', async () => {
    const res = await getRow(request('GET', 'songs/nope'), ctx({ kind: 'songs', id: 'nope' }));
    expect(res.status).toBe(404);
  });
});

describe('PUT: an edit', () => {
  it('saves the row, marks it edited, audits what changed, and the public pages serve it', async () => {
    const before = await getBankDetail('artists', 'devo');
    const { id: _id, memberOf: _m, ...body } = before!.artist;

    const res = await putRow(
      request('PUT', 'artists/devo', { ...body, story: 'A new story.' }),
      ctx({ kind: 'artists', id: 'devo' })
    );

    expect(res.status).toBe(200);
    expect(row('bankArtist', 'devo')?.editedAt).toBeInstanceOf(Date);
    expect(auditCalls()).toEqual([
      expect.objectContaining({
        action: 'bank_artist.update',
        entityType: 'bank_artist',
        entityId: 'devo',
        entityName: 'Devo',
        changes: { story: { from: before!.artist.story, to: 'A new story.' } },
      }),
    ]);
    expect((await getBankDetail('artists', 'devo'))?.artist.story).toBe('A new story.');
  });

  it('writes and audits nothing when nothing changed, so the row stays the seed’s', async () => {
    const body = await songBody(BACH, (s) => s);
    const res = await putRow(
      request('PUT', `songs/${BACH}`, body),
      ctx({ kind: 'songs', id: BACH })
    );

    expect(res.status).toBe(200);
    expect(store.writes).toEqual([]);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
    expect(row('bankSong', BACH)?.editedAt).toBeNull();
  });

  it("rewrites a song's parts and their per-synth rows, which the synth's Heard on list reads", async () => {
    const body = await songBody(BACH, (s) => ({
      ...s,
      parts: [
        {
          instruments: ['moog-modular'],
          on: 'Moog modular',
          synths: ['model-d'],
          sounds: { 'model-d': 'baroque-line-voice' },
          text: 'Rewritten.',
          notes: { 'model-d': 'As heard on the Model D.' },
        },
      ],
    }));
    const res = await putRow(
      request('PUT', `songs/${BACH}`, body),
      ctx({ kind: 'songs', id: BACH })
    );

    expect(res.status).toBe(200);
    // The System 15 sound has gone with the part that named it.
    expect(store.tables.bankPartSynth.filter((r) => String(r.partId).startsWith(BACH))).toEqual([
      expect.objectContaining({
        synthId: 'model-d',
        listed: true,
        note: 'As heard on the Model D.',
      }),
    ]);
    // From the whole databank as the read layer loads it; the fake does not model getHeardOn's relation filters.
    const heard = heardFor(await loadBank(), 'model-d').find((h) => h.song === BACH);
    expect(heard).toMatchObject({ text: 'As heard on the Model D.', sound: 'baroque-line-voice' });
  });

  it('takes a member off a group, and the member no longer lists the group', async () => {
    const before = await getBankDetail('artists', 'depeche-mode');
    const { id: _id, memberOf: _m, ...body } = before!.artist;

    await putRow(
      request('PUT', 'artists/depeche-mode', { ...body, members: [] }),
      ctx({ kind: 'artists', id: 'depeche-mode' })
    );

    const groups = (await getBankDetail('artists', 'vince-clarke'))?.groups.map((g) => g.id);
    expect(groups).not.toContain('depeche-mode');
    expect(groups).toContain('yazoo');
  });

  it('refuses a part naming an instrument the databank does not have, and writes nothing', async () => {
    const body = await songBody(BACH, (s) => ({
      ...s,
      parts: [{ instruments: ['moog-nope'], on: 'Moog', text: 'x' }],
    }));
    const res = await putRow(
      request('PUT', `songs/${BACH}`, body),
      ctx({ kind: 'songs', id: BACH })
    );

    expect(res.status).toBe(400);
    expect(await problems(res)).toEqual([`song ${BACH}: unknown instrument moog-nope`]);
    expect(store.writes).toEqual([]);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a sound the synth's library does not have", async () => {
    const body = await songBody(BACH, (s) => ({
      ...s,
      parts: [
        {
          instruments: ['moog-modular'],
          on: 'Moog',
          sounds: { 'model-d': 'no-such-sound' },
          text: 'x',
        },
      ],
    }));
    const res = await putRow(
      request('PUT', `songs/${BACH}`, body),
      ctx({ kind: 'songs', id: BACH })
    );

    expect(res.status).toBe(400);
    expect(await problems(res)).toEqual([`song ${BACH}: model-d has no sound no-such-sound`]);
    expect(store.writes).toEqual([]);
  });

  it('refuses a recreation of an instrument that is not there', async () => {
    const detail = await getBankDetail('instruments', 'behringer-deepmind-12');
    const { id: _id, ...body } = detail!.instrument;
    const res = await putRow(
      request('PUT', 'instruments/behringer-deepmind-12', { ...body, recreationOf: 'nope' }),
      ctx({ kind: 'instruments', id: 'behringer-deepmind-12' })
    );

    expect(res.status).toBe(400);
    expect(await problems(res)).toEqual([
      'instrument behringer-deepmind-12: recreates unknown instrument nope',
    ]);
  });

  it('refuses an id a list names twice, naming each, rather than reaching the join as a key clash', async () => {
    const body = await songBody(BACH, (s) => ({
      ...s,
      artists: ['wendy-carlos', 'wendy-carlos'],
      parts: [{ instruments: ['moog-modular', 'moog-modular'], on: 'Moog', text: 'x' }],
    }));
    const res = await putRow(
      request('PUT', `songs/${BACH}`, body),
      ctx({ kind: 'songs', id: BACH })
    );

    expect(res.status).toBe(400);
    expect(await problems(res)).toEqual([
      `song ${BACH}: artist wendy-carlos is listed twice`,
      `song ${BACH} part 1: instrument moog-modular is listed twice`,
    ]);
    expect(store.writes).toEqual([]);
  });

  it('updates rather than recreates, so a row removed since the check is a conflict, not back', async () => {
    const songs = store.client.bankSong as { update: ReturnType<typeof vi.fn> };
    songs.update.mockRejectedValueOnce(
      Object.assign(new Error('Record to update not found'), { code: 'P2025' })
    );
    const body = await songBody(BACH, (s) => ({ ...s, title: 'Renamed' }));
    const res = await putRow(
      request('PUT', `songs/${BACH}`, body),
      ctx({ kind: 'songs', id: BACH })
    );

    expect(res.status).toBe(409);
    expect((await json(res)).error?.message).toMatch(/changed while this was being saved/);
    expect(store.writes).not.toContain('bankSong.create');
    expect(store.writes).not.toContain('bankSong.upsert');
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('is a 404 for a row that is not there', async () => {
    const res = await putRow(
      request('PUT', 'makers/nope', { name: 'x' }),
      ctx({ kind: 'makers', id: 'nope' })
    );
    expect(res.status).toBe(400); // the body is checked first, and this one is not a maker
    const ok = loadBankData().makers[0];
    const { id: _id, ...body } = ok;
    const missing = await putRow(
      request('PUT', 'makers/nope', body),
      ctx({ kind: 'makers', id: 'nope' })
    );
    expect(missing.status).toBe(404);
  });
});

describe('POST: a new row', () => {
  const instrument = {
    id: 'example-hybrid-synth',
    name: 'Example Hybrid Synth',
    maker: 'Sequential',
    year: '2018',
    kind: 'poly',
    people: ['dave-smith'],
    text: 'A sample-and-synthesis hybrid.',
  };

  it('creates it, edited, audited, and listed', async () => {
    const res = await postRow(
      request('POST', 'instruments', instrument),
      ctx({ kind: 'instruments' })
    );

    expect(res.status).toBe(201);
    expect(row('bankInstrument', instrument.id)?.editedAt).toBeInstanceOf(Date);
    expect(store.tables.bankInstrumentPerson).toContainEqual({
      instrumentId: instrument.id,
      makerId: 'dave-smith',
      order: 0,
    });
    expect(auditCalls()[0]).toMatchObject({
      action: 'bank_instrument.create',
      entityId: instrument.id,
      entityName: 'Example Hybrid Synth',
    });
    expect((await getBankDetail('instruments', instrument.id))?.people).toEqual([
      expect.objectContaining({ id: 'dave-smith' }),
    ]);
  });

  it('refuses an id that is taken, and one an artist already has (they share ids with makers)', async () => {
    const taken = await postRow(
      request('POST', 'instruments', { ...instrument, id: 'moog-minimoog' }),
      ctx({ kind: 'instruments' })
    );
    expect(taken.status).toBe(409);

    const maker = { ...loadBankData().makers[0], id: 'devo' };
    const shared = await postRow(request('POST', 'makers', maker), ctx({ kind: 'makers' }));
    expect(shared.status).toBe(400);
    expect(await problems(shared)).toEqual(['duplicate maker id devo']);
    expect(store.writes).toEqual([]);
  });

  it('refuses the id new, which is the admin form’s address', async () => {
    const res = await postRow(
      request('POST', 'instruments', { ...instrument, id: 'new' }),
      ctx({ kind: 'instruments' })
    );
    expect(res.status).toBe(400);
    expect(store.writes).toEqual([]);
  });

  it('refuses a maker the databank does not have', async () => {
    const res = await postRow(
      request('POST', 'instruments', { ...instrument, people: ['nobody'] }),
      ctx({ kind: 'instruments' })
    );
    expect(res.status).toBe(400);
    expect(await problems(res)).toEqual([`instrument ${instrument.id}: unknown maker nobody`]);
  });
});

describe('DELETE: a removal', () => {
  it('is refused while songs still credit the artist, naming each, and removes nothing', async () => {
    const res = await deleteRow(
      request('DELETE', 'artists/wendy-carlos'),
      ctx({ kind: 'artists', id: 'wendy-carlos' })
    );

    expect(res.status).toBe(409);
    const named = await problems(res);
    expect(named).toEqual(
      expect.arrayContaining([
        `song ${BACH}: unknown artist wendy-carlos`,
        'song wendy-carlos-a-clockwork-orange: unknown artist wendy-carlos',
      ])
    );
    expect(store.writes).toEqual([]);
    expect(row('bankArtist', 'wendy-carlos')).toBeDefined();
  });

  it('is refused for a member a group still lists', async () => {
    const res = await deleteRow(
      request('DELETE', 'artists/vince-clarke'),
      ctx({ kind: 'artists', id: 'vince-clarke' })
    );
    expect(res.status).toBe(409);
    expect(await problems(res)).toContain('artist depeche-mode: unknown members vince-clarke');
  });

  it('removes a song and its parts, records the removal and audits it', async () => {
    const res = await deleteRow(
      request('DELETE', `songs/${BACH}`),
      ctx({ kind: 'songs', id: BACH })
    );

    expect(res.status).toBe(200);
    expect(row('bankSong', BACH)).toBeUndefined();
    expect(store.tables.bankSongPart.filter((p) => p.songId === BACH)).toEqual([]);
    expect(store.tables.bankPartSynth.filter((p) => String(p.partId).startsWith(BACH))).toEqual([]);
    expect(store.tables.bankRemoval).toEqual([
      expect.objectContaining({ kind: 'songs', id: BACH }),
    ]);
    expect(auditCalls()[0]).toMatchObject({
      action: 'bank_song.delete',
      entityId: BACH,
      entityName: 'Switched-On Bach',
    });
  });

  it('removes an innovator and an artist nothing points at', async () => {
    // Every artist in the data is credited or in a group, so this one is new.
    const { memberOf: _m, ...pierre } = loadBankData().artists.find((a) => a.id === 'dj-pierre')!;
    await postRow(
      request('POST', 'artists', { ...pierre, id: 'someone-new' }),
      ctx({ kind: 'artists' })
    );
    mockLogAdminAction.mockClear();

    const maker = await deleteRow(
      request('DELETE', 'makers/harald-bode'),
      ctx({ kind: 'makers', id: 'harald-bode' })
    );
    const artist = await deleteRow(
      request('DELETE', 'artists/someone-new'),
      ctx({ kind: 'artists', id: 'someone-new' })
    );

    expect([maker.status, artist.status]).toEqual([200, 200]);
    expect(row('bankMaker', 'harald-bode')).toBeUndefined();
    expect(row('bankArtist', 'someone-new')).toBeUndefined();
    expect(auditCalls().map((c) => c.action)).toEqual(['bank_maker.delete', 'bank_artist.delete']);
  });

  it('reports a reference that went between the check and the write as a conflict', async () => {
    const tx = store.client.bankSong as { delete: ReturnType<typeof vi.fn> };
    tx.delete.mockRejectedValueOnce(Object.assign(new Error('FK'), { code: 'P2003' }));

    const res = await deleteRow(
      request('DELETE', `songs/${BACH}`),
      ctx({ kind: 'songs', id: BACH })
    );

    expect(res.status).toBe(409);
    expect((await json(res)).error?.message).toMatch(/changed while this was being saved/);
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('lets any other write failure through as itself', async () => {
    const tx = store.client.bankSong as { delete: ReturnType<typeof vi.fn> };
    tx.delete.mockRejectedValueOnce(new Error('connection lost'));
    const res = await deleteRow(
      request('DELETE', `songs/${BACH}`),
      ctx({ kind: 'songs', id: BACH })
    );
    expect(res.status).toBe(500);
  });

  it('is a 404 for a row that is not there', async () => {
    const res = await deleteRow(
      request('DELETE', 'songs/nope'),
      ctx({ kind: 'songs', id: 'nope' })
    );
    expect(res.status).toBe(404);
  });
});

describe('a reseed afterwards', () => {
  const reseed = () => seedBank(mockPrisma as unknown as TenancyClient, loadBankData());

  it('leaves an edited row and its joins as the admin left them', async () => {
    const body = await songBody(BACH, (s) => ({
      ...s,
      title: 'Switched-On Bach (edited)',
      parts: [{ instruments: ['moog-minimoog'], on: 'Minimoog', text: 'Edited.' }],
    }));
    await putRow(request('PUT', `songs/${BACH}`, body), ctx({ kind: 'songs', id: BACH }));

    const report = await reseed();

    expect(report.songs.edited).toBe(1);
    expect(row('bankSong', BACH)?.title).toBe('Switched-On Bach (edited)');
    expect((await getBankDetail('songs', BACH))?.song.parts).toEqual([
      { instruments: ['moog-minimoog'], on: 'Minimoog', text: 'Edited.' },
    ]);
  });

  it('does not bring a removed row back', async () => {
    await deleteRow(request('DELETE', `songs/${BACH}`), ctx({ kind: 'songs', id: BACH }));

    const report = await reseed();

    expect(row('bankSong', BACH)).toBeUndefined();
    expect(report.songs.created).toBe(0);
  });

  it('lets an admin save a removed id again, which takes it off the removed list', async () => {
    await deleteRow(
      request('DELETE', 'instruments/rca-theremin'),
      ctx({ kind: 'instruments', id: 'rca-theremin' })
    );
    const original = loadBankData().instruments.find((i) => i.id === 'rca-theremin')!;

    const res = await postRow(
      request('POST', 'instruments', original),
      ctx({ kind: 'instruments' })
    );

    expect(res.status).toBe(201);
    expect(store.tables.bankRemoval).toEqual([]);
  });
});
