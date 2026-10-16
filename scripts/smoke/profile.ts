/**
 * Smoke: synth profiles and the synths owned and wanted against the real dev database (`f-profiles` r1 and r2).
 *
 *   npm run smoke:profile            (after `npm run db:migrate:deploy`)
 *
 * What no unit test can prove, because unit tests have no database:
 *
 * 1. The store writes and reads a real `synth_profile` row, and the real unique index on `username` refuses a second
 *    user the same name; a change holds the old name in `held_username` against anyone else.
 * 2. The synths owned and wanted (r2): real `owned_instrument` rows, whose primary key refuses a second row for one
 *    user and instrument, and which go when the databank removes their instrument (`Cascade`).
 * 3. `exportUserData()` carries the user's profile in its `app.synthProfile` section and their synths in
 *    `app.ownedSynths`, and nobody else's.
 * 4. `eraseUser()` erases both: the hand-written `synth_profile_userId_fkey` and `owned_instrument_userId_fkey`
 *    cascade. Another user's stay.
 *
 * Skips cleanly (exit 0) when no database is reachable. Self-cleaning: creates only `smoke-test-profile-*` users, whose
 * profiles and lists go with them, the held names it made, and one `smoke-test-profile-*` databank instrument, and
 * removes whatever it created on every path. Printing goes
 * through `console`, not `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */
import { prisma } from '@/lib/db/client';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { eraseUser } from '@/lib/privacy/erase-user';
import { exportUserData } from '@/lib/privacy/export-user';
import { addInstrument, listInstruments, moveInstrument } from '@/lib/app/profile/instruments';
import { getProfile, saveProfile } from '@/lib/app/profile/profile';
import type { ProfileInput } from '@/lib/app/profile/profile-data';

const PREFIX = 'smoke-test-profile';
const stamp = Date.now().toString(36);

const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

async function dbReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const NO_LINKS = { youtube: null, spotify: null, instagram: null, bandcamp: null };

function profileInput(username: string, overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    username,
    links: NO_LINKS,
    public: false,
    showOwned: false,
    showWishlist: false,
    ...overrides,
  };
}

async function main(): Promise<void> {
  if (!(await dbReachable())) {
    console.log('smoke:profile skipped — no database reachable (DATABASE_URL unset or DB down).');
    return;
  }

  const userIds: string[] = [];
  const names = [`smk-${stamp}-a`, `smk-${stamp}-b`, `smk-${stamp}-c`];
  const tempInstrumentId = `${PREFIX}-${stamp}`;
  const user = async (who: string) => {
    const row = await prisma.user.create({
      data: { name: `${PREFIX} ${who}`, email: `${PREFIX}-${who}-${stamp}@example.com` },
    });
    userIds.push(row.id);
    return row;
  };

  try {
    const subject = await user('subject');
    const other = await user('other');

    // 1. Real rows, the unique index, the hold.
    await saveProfile(
      subject.id,
      profileInput(names[0], {
        links: { ...NO_LINKS, bandcamp: 'https://tapeloops.bandcamp.com' },
        public: true,
      })
    );
    const read = await getProfile(subject.id);
    check(
      read?.username === names[0] &&
        read.public &&
        read.links.bandcamp === 'https://tapeloops.bandcamp.com',
      'a saved profile reads back from a real row'
    );

    let refused = false;
    try {
      await prisma.synthProfile.create({ data: { userId: other.id, username: names[0] } });
    } catch (err) {
      refused = typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
    }
    check(refused, 'the unique index refuses a second profile with the same username');

    await saveProfile(subject.id, profileInput(names[1]));
    check(
      (await prisma.heldUsername.count({ where: { username: names[0] } })) === 1,
      'changing the username holds the old one in held_username'
    );
    let held = false;
    try {
      await saveProfile(other.id, profileInput(names[0]));
    } catch {
      held = true;
    }
    check(held, 'the held name is refused to someone else');
    await saveProfile(other.id, profileInput(names[2]));

    // 2. The synths owned and wanted.
    const kept = await prisma.bankInstrument.findFirst({
      where: { id: { not: { startsWith: PREFIX } } },
      select: { id: true },
    });
    if (!kept) throw new Error('The databank is empty: run npm run db:seed first');
    await prisma.bankInstrument.create({
      data: {
        id: tempInstrumentId,
        name: 'Smoke Test Synth',
        maker: 'Smoke',
        year: '2026',
        kind: 'mono',
        text: 'A databank entry the profile smoke makes and removes.',
      },
    });
    await addInstrument(subject.id, { instrumentId: kept.id, kind: 'wishlist' });
    await addInstrument(subject.id, { instrumentId: tempInstrumentId, kind: 'owned' });
    await moveInstrument(subject.id, kept.id, 'owned');
    await addInstrument(other.id, { instrumentId: kept.id, kind: 'wishlist' });
    const lists = await listInstruments(subject.id);
    check(
      lists.owned.map((e) => e.instrumentId).join() === [tempInstrumentId, kept.id].join() &&
        lists.wishlist.length === 0,
      'synths added and moved read back from real rows, in order'
    );
    let twice = false;
    try {
      await prisma.ownedInstrument.create({
        data: { userId: subject.id, instrumentId: kept.id, kind: 'wishlist', position: 9 },
      });
    } catch (err) {
      twice = typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
    }
    check(twice, 'the primary key refuses one synth on both of a user’s lists');
    await prisma.bankInstrument.delete({ where: { id: tempInstrumentId } });
    check(
      (await prisma.ownedInstrument.count({ where: { instrumentId: tempInstrumentId } })) === 0 &&
        (await prisma.ownedInstrument.count({ where: { userId: subject.id } })) === 1,
      'removing an instrument from the databank removes it from every list (Cascade), and nothing else'
    );

    // 3. The export.
    const bundle = await exportUserData({
      userId: subject.id,
      actorUserId: subject.id,
      reason: 'self_service',
    });
    const exported = bundle.app.synthProfile;
    check(
      Array.isArray(exported) &&
        exported.length === 1 &&
        JSON.stringify(exported).includes(names[1]) &&
        !JSON.stringify(exported).includes(names[2]),
      "the export's app.synthProfile holds the subject's profile and nobody else's"
    );
    const synths = bundle.app.ownedSynths;
    check(
      Array.isArray(synths) &&
        synths.length === 1 &&
        JSON.stringify(synths).includes(kept.id) &&
        JSON.stringify(synths).includes('"kind":"owned"'),
      "the export's app.ownedSynths holds the subject's synths and nobody else's"
    );

    // 4. The erasure.
    await eraseUser({
      userId: subject.id,
      userEmail: subject.email,
      actorUserId: subject.id,
      reason: 'self_service',
    });
    check(
      (await prisma.synthProfile.count({ where: { userId: subject.id } })) === 0,
      'erasing the subject erases their profile (synth_profile_userId_fkey cascades)'
    );
    check(
      (await prisma.synthProfile.count({ where: { userId: other.id } })) === 1,
      "another user's profile stays"
    );
    check(
      (await prisma.ownedInstrument.count({ where: { userId: subject.id } })) === 0,
      'erasing the subject erases their synths (owned_instrument_userId_fkey cascades)'
    );
    check(
      (await prisma.ownedInstrument.count({ where: { userId: other.id } })) === 1,
      "another user's synths stay"
    );
  } finally {
    await prisma.heldUsername
      .deleteMany({ where: { username: { in: names } } })
      .catch(() => undefined);
    await prisma.dataErasureReceipt
      .deleteMany({ where: { subjectUserId: { in: userIds } } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    await prisma.bankInstrument
      .deleteMany({ where: { id: tempInstrumentId } })
      .catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
  }

  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log('\nsmoke:profile passed');
}

runAsOrg(INSTALL_ORG_ID, main, { source: 'job' }).catch(async (err) => {
  console.error('\nsmoke:profile failed:', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
