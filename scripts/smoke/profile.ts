/**
 * Smoke: synth profiles against the real dev database (`f-profiles` r1).
 *
 *   npm run smoke:profile            (after `npm run db:migrate:deploy`)
 *
 * What no unit test can prove, because unit tests have no database:
 *
 * 1. The store writes and reads a real `synth_profile` row, and the real unique index on `username` refuses a second
 *    user the same name; a change holds the old name in `held_username` against anyone else.
 * 2. `exportUserData()` carries the user's profile in its `app.synthProfile` section, and nobody else's.
 * 3. `eraseUser()` erases it: the hand-written `synth_profile_userId_fkey` cascades. Another user's profile stays.
 *
 * Skips cleanly (exit 0) when no database is reachable. Self-cleaning: creates only `smoke-test-profile-*` users, whose
 * profiles go with them, and the held names it made, and removes whatever it created on every path. Printing goes
 * through `console`, not `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */
import { prisma } from '@/lib/db/client';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { eraseUser } from '@/lib/privacy/erase-user';
import { exportUserData } from '@/lib/privacy/export-user';
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

    // 2. The export.
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

    // 3. The erasure.
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
  } finally {
    await prisma.heldUsername
      .deleteMany({ where: { username: { in: names } } })
      .catch(() => undefined);
    await prisma.dataErasureReceipt
      .deleteMany({ where: { subjectUserId: { in: userIds } } })
      .catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
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
