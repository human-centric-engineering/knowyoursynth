/**
 * Smoke: the databank against the real dev database (`f-databank` b1).
 *
 *   npm run smoke:bank            (after `npm run db:seed`)
 *
 * What no unit test can prove, because unit tests have no database:
 *
 * 1. The seeded tables hold the seed data's counts: 50 makers, 184 artists and 248 songs from the prototype, and its 86
 *    instruments plus the reference list (b4).
 * 2. Seeding again writes nothing: every row unchanged and no joins rewritten.
 * 3. The read layer gives back what was seeded: `loadBank()` equals the seed data, with a membership read from
 *    either side (the table holds each pair once).
 * 4. `getHeardOn()` gives every synth the list the prototype gave it (`tests/fixtures/bank/heard-on.json`).
 *
 * Read-only apart from step 2, which writes nothing when the database is seeded. Like `check-synths.ts`, this reads
 * the seed data, so it is an allowed reader in `seed-data-boundary.test.ts`. Printing goes through `console`, not
 * `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import type { Bank } from '@/lib/app/bank/data';
import { groupsOf, membersOf } from '@/lib/app/bank/joins';
import { getHeardOn, loadBank } from '@/lib/app/bank/read';
import { seedBank } from '@/lib/app/bank/seed';
import { loadBankData } from '@/prisma/seeds/app-knowyoursynth/bank-data';

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

/** Sorted by id, with each artist's memberships read from both sides, so two banks compare by content. */
function normalise(bank: Bank): Bank {
  const byId = <T extends { id: string }>(rows: T[]) =>
    [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    makers: byId(bank.makers),
    instruments: byId(bank.instruments).map((i) => ({
      ...i,
      ...(i.app ? { app: [...i.app].sort() } : {}),
    })),
    artists: byId(bank.artists).map((a) => {
      const { members: _m, memberOf: _o, ...rest } = a;
      return {
        ...rest,
        members: membersOf(bank, a.id).sort(),
        memberOf: groupsOf(bank, a.id).sort(),
      };
    }),
    songs: byId(bank.songs).map((s) => ({
      ...s,
      parts: s.parts.map((p) => ({ ...p, ...(p.synths ? { synths: [...p.synths].sort() } : {}) })),
    })),
  };
}

async function main(): Promise<void> {
  const counts = await Promise.all([
    prisma.bankMaker.count(),
    prisma.bankInstrument.count(),
    prisma.bankArtist.count(),
    prisma.bankSong.count(),
  ]);
  const data = loadBankData();
  const expected = [50, data.instruments.length, 184, 248];
  check(
    isDeepStrictEqual(counts, expected),
    `counts ${counts.join('/')} are ${expected.join('/')}`
  );

  const report = await seedBank(prisma, data);
  const tables = [report.makers, report.instruments, report.artists, report.songs];
  check(
    tables.every((c) => c.created === 0 && c.updated === 0) && report.joinsRewritten === 0,
    `a second seed writes nothing (${JSON.stringify(report)})`
  );

  const stored = normalise(await loadBank());
  const seeded = normalise(data);
  for (const kind of ['makers', 'instruments', 'artists', 'songs'] as const) {
    const differ = seeded[kind].filter((row, i) => !isDeepStrictEqual(row, stored[kind][i]));
    check(
      stored[kind].length === seeded[kind].length && !differ.length,
      `${kind} read back as seeded${differ.length ? ` (first differing: ${differ[0].id})` : ''}`
    );
  }

  // Compared by value, so each list only needs to be a list.
  const golden = z
    .record(z.string(), z.array(z.unknown()))
    .parse(
      JSON.parse(
        readFileSync(
          resolve(import.meta.dirname, '../../tests/fixtures/bank/heard-on.json'),
          'utf8'
        )
      )
    );
  let entries = 0;
  for (const [synthId, expected] of Object.entries(golden)) {
    const { heard } = await getHeardOn(synthId);
    entries += heard.length;
    if (!isDeepStrictEqual(heard, expected))
      check(false, `${synthId}: Heard on equals the prototype's`);
  }
  check(
    entries > 0 && !failures.some((f) => f.includes('Heard on')),
    `Heard on equals the prototype's for ${Object.keys(golden).length} synths (${entries} entries)`
  );
}

runAsOrg(INSTALL_ORG_ID, main, { source: 'job' })
  .catch((err: unknown) => {
    failures.push(err instanceof Error ? err.message : String(err));
    console.log('ERR', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failures.length ? 1 : 0);
  });
