/**
 * Asking for a synth to be modelled (`f-synth-picker` t-330), over an in-memory fake of `ModelRequest`. Pins:
 *
 * - one request per user and instrument: asking again changes nothing; withdrawing removes it, and one never made
 *   changes nothing;
 * - a user's state is theirs alone, and the count is everyone's;
 * - an instrument the databank does not have is a 404;
 * - admins see each instrument anyone asked for, the most asked first, then the most recently asked, naming nobody.
 *
 * @see lib/app/picker/model-requests.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { userId: string; instrumentId: string; createdAt: Date };
const db = vi.hoisted(() => ({ rows: [] as Row[], clock: 0 }));
const BANK = vi.hoisted(() => [
  {
    id: 'moog-minimoog',
    name: 'Minimoog Model D',
    maker: 'Moog Music',
    year: '1970',
    kind: 'mono',
  },
  { id: 'arp-odyssey', name: 'ARP Odyssey', maker: 'ARP Instruments', year: '1972', kind: 'mono' },
]);

vi.mock('@/lib/db/client', () => {
  const key = (w: { userId_instrumentId: { userId: string; instrumentId: string } }) =>
    w.userId_instrumentId;
  const modelRequest = {
    findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
      db.rows
        .filter((r) => r.userId === where.userId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((r) => ({ instrumentId: r.instrumentId }))
    ),
    findUnique: vi.fn(async ({ where }: { where: Parameters<typeof key>[0] }) => {
      const k = key(where);
      const row = db.rows.find((r) => r.userId === k.userId && r.instrumentId === k.instrumentId);
      return row ? { userId: row.userId } : null;
    }),
    count: vi.fn(
      async ({ where }: { where: { instrumentId: string } }) =>
        db.rows.filter((r) => r.instrumentId === where.instrumentId).length
    ),
    upsert: vi.fn(async ({ create }: { create: { userId: string; instrumentId: string } }) => {
      if (!BANK.some((b) => b.id === create.instrumentId))
        throw Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' });
      const held = db.rows.find(
        (r) => r.userId === create.userId && r.instrumentId === create.instrumentId
      );
      if (held) return held;
      const row = { ...create, createdAt: new Date(Date.UTC(2026, 10, 27, 0, 0, db.clock++)) };
      db.rows.push(row);
      return row;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { userId: string; instrumentId: string } }) => {
      const before = db.rows.length;
      db.rows = db.rows.filter(
        (r) => !(r.userId === where.userId && r.instrumentId === where.instrumentId)
      );
      return { count: before - db.rows.length };
    }),
    groupBy: vi.fn(async () => {
      const groups = new Map<string, Row[]>();
      for (const r of db.rows)
        groups.set(r.instrumentId, [...(groups.get(r.instrumentId) ?? []), r]);
      return [...groups].map(([instrumentId, rows]) => ({
        instrumentId,
        _count: { _all: rows.length },
        _max: { createdAt: new Date(Math.max(...rows.map((r) => r.createdAt.getTime()))) },
      }));
    }),
  };
  return {
    prisma: {
      modelRequest,
      bankInstrument: {
        findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          BANK.filter((b) => where.id.in.includes(b.id))
        ),
      },
    },
  };
});

import {
  askToModel,
  getModelRequest,
  listMyModelRequests,
  tallyModelRequests,
  withdrawModelRequest,
} from '@/lib/app/picker/model-requests';
import { NotFoundError } from '@/lib/api/errors';

beforeEach(() => {
  db.rows = [];
  db.clock = 0;
});

describe('asking and withdrawing', () => {
  it('records one request per user and instrument, however often they ask', async () => {
    expect(await askToModel('ann', 'moog-minimoog')).toEqual({
      instrumentId: 'moog-minimoog',
      asked: true,
      count: 1,
    });
    expect(await askToModel('ann', 'moog-minimoog')).toMatchObject({ asked: true, count: 1 });
    expect(await askToModel('bob', 'moog-minimoog')).toMatchObject({ count: 2 });
  });

  it('withdraws only that user’s request, and a withdrawal never made changes nothing', async () => {
    await askToModel('ann', 'moog-minimoog');
    await askToModel('bob', 'moog-minimoog');
    expect(await withdrawModelRequest('ann', 'moog-minimoog')).toEqual({
      instrumentId: 'moog-minimoog',
      asked: false,
      count: 1,
    });
    expect(await withdrawModelRequest('ann', 'moog-minimoog')).toMatchObject({ count: 1 });
    expect(await getModelRequest('bob', 'moog-minimoog')).toMatchObject({ asked: true });
  });

  it('is a 404 for an instrument the databank does not have, recording nothing', async () => {
    await expect(askToModel('ann', 'no-such-synth')).rejects.toBeInstanceOf(NotFoundError);
    expect(db.rows).toEqual([]);
  });
});

describe('reading', () => {
  it('says whether this user asked, and how many did in all', async () => {
    await askToModel('bob', 'arp-odyssey');
    expect(await getModelRequest('ann', 'arp-odyssey')).toEqual({
      instrumentId: 'arp-odyssey',
      asked: false,
      count: 1,
    });
  });

  it('lists a user’s own requests, oldest first, and no one else’s', async () => {
    await askToModel('ann', 'arp-odyssey');
    await askToModel('bob', 'moog-minimoog');
    await askToModel('ann', 'moog-minimoog');
    expect(await listMyModelRequests('ann')).toEqual(['arp-odyssey', 'moog-minimoog']);
  });
});

describe('tallyModelRequests', () => {
  it('is empty when nobody has asked', async () => {
    expect(await tallyModelRequests()).toEqual([]);
  });

  it('lists the most asked first, then the most recently asked, naming nobody', async () => {
    await askToModel('ann', 'arp-odyssey');
    await askToModel('bob', 'moog-minimoog');
    await askToModel('cat', 'moog-minimoog');
    const tally = await tallyModelRequests();
    expect(tally.map((t) => [t.instrument.id, t.count])).toEqual([
      ['moog-minimoog', 2],
      ['arp-odyssey', 1],
    ]);
    expect(tally[0].instrument).toEqual(BANK[0]);
    expect(JSON.stringify(tally)).not.toMatch(/ann|bob|cat/);
  });

  it('breaks a tie by who was asked for most recently', async () => {
    await askToModel('ann', 'arp-odyssey');
    await askToModel('bob', 'moog-minimoog');
    expect((await tallyModelRequests()).map((t) => t.instrument.id)).toEqual([
      'moog-minimoog',
      'arp-odyssey',
    ]);
  });
});
