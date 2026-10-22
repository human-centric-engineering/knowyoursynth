/**
 * Smoke: users' patterns against the real dev database (`f-step-sequencer` t-81).
 *
 *   npm run smoke:patterns            (after `npm run db:migrate:deploy`)
 *
 * What no unit test can prove, because unit tests have no database:
 *
 * 1. The store writes and reads a real `user_pattern` row, and the pattern comes back exactly as it was saved.
 * 2. A sound's default pattern: the real `user_sound_patternId_fkey` refuses a pattern that does not exist, and
 *    deleting the pattern nulls the pointer (`ON DELETE SET NULL`) and leaves the sound.
 * 3. `exportUserData()` carries the user's patterns in `app.patterns`, and each sound's default in `app.sounds`, and
 *    nobody else's.
 * 4. `eraseUser()` erases the user's patterns (the hand-written `user_pattern_userId_fkey` cascades). Another user's
 *    stay.
 *
 * Skips cleanly (exit 0) when no database is reachable. Self-cleaning: creates only `smoke-test-patterns-*` users,
 * whose patterns and sounds go with them, and removes them on every path. Printing goes through `console`, not
 * `logger` — see the `scripts/**` override in `eslint.config.mjs`.
 */
import { prisma } from '@/lib/db/client';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { eraseUser } from '@/lib/privacy/erase-user';
import { exportUserData } from '@/lib/privacy/export-user';
import { importPhrase } from '@/lib/app/sequencer/import';
import {
  createUserPattern,
  deleteUserPattern,
  getUserPattern,
  listUserPatterns,
} from '@/lib/app/patterns/store';
import { getSynthDef } from '@/lib/app/synths/defs';

const PREFIX = 'smoke-test-patterns';
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

const riff = importPhrase({
  bpm: 110,
  loop: true,
  steps: [
    [0, 36, 1, 0.5],
    [1, 48, 0.5],
    [1, 52, 0.5],
    [2.67, 43, 1],
  ],
});

async function main(): Promise<void> {
  if (!(await dbReachable())) {
    console.log('smoke:patterns skipped: no database reachable');
    return;
  }
  const userIds: string[] = [];
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
    const def = getSynthDef('model-d');
    if (!def) throw new Error('model-d is not in the registry');

    // 1. A real row, read back as saved.
    const kept = await createUserPattern(subject.id, {
      name: 'Kept',
      pattern: riff,
      synthId: 'model-d',
    });
    const read = await getUserPattern(subject.id, kept.id);
    check(
      JSON.stringify(read.pattern) === JSON.stringify(riff),
      'a saved pattern reads back exactly'
    );
    const theirs = await createUserPattern(other.id, { name: 'Theirs', pattern: riff });
    check(
      (await listUserPatterns(subject.id)).map((p) => p.id).join() === kept.id,
      "the list is the subject's own"
    );

    // 2. A sound's default pattern, and the SET NULL.
    const sound = (owner: string, name: string, patternId: string | null) =>
      prisma.userSound.create({
        data: {
          userId: owner,
          synthId: def.id,
          definitionVersion: def.version,
          name,
          values: {},
          cables: [],
          patternId,
        },
      });
    let refused = false;
    try {
      await sound(subject.id, 'Dangling', 'no-such-pattern');
    } catch (err) {
      refused = typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2003';
    }
    check(refused, 'the foreign key refuses a pattern that does not exist');
    const short = await createUserPattern(subject.id, { name: 'Short-lived', pattern: riff });
    const withShort = await sound(subject.id, 'Plays the short one', short.id);
    const withKept = await sound(subject.id, 'Plays the kept one', kept.id);
    await deleteUserPattern(subject.id, short.id);
    const after = await prisma.userSound.findUnique({ where: { id: withShort.id } });
    check(
      after !== null && after.patternId === null,
      "deleting a pattern nulls its sounds' pointer (SET NULL) and keeps the sound"
    );

    // 3. The export.
    const bundle = await exportUserData({
      userId: subject.id,
      actorUserId: subject.id,
      reason: 'self_service',
    });
    const exported = JSON.stringify(bundle.app.patterns);
    check(
      Array.isArray(bundle.app.patterns) &&
        bundle.app.patterns.length === 1 &&
        exported.includes(kept.id) &&
        !exported.includes(theirs.id),
      "the export's app.patterns holds the subject's patterns and nobody else's"
    );
    check(
      JSON.stringify(bundle.app.sounds).includes(`"patternId":"${kept.id}"`),
      "the export's app.sounds carries each sound's default pattern"
    );

    // 4. The erasure.
    await eraseUser({
      userId: subject.id,
      userEmail: subject.email,
      actorUserId: subject.id,
      reason: 'self_service',
    });
    check(
      (await prisma.userPattern.count({ where: { userId: subject.id } })) === 0 &&
        (await prisma.userSound.count({ where: { id: withKept.id } })) === 0,
      'erasing the subject erases their patterns (user_pattern_userId_fkey cascades) and their sounds'
    );
    check(
      (await prisma.userPattern.count({ where: { userId: other.id } })) === 1,
      "another user's patterns stay"
    );
  } finally {
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
  console.log('\nsmoke:patterns passed');
}

runAsOrg(INSTALL_ORG_ID, main, { source: 'job' }).catch(async (err) => {
  console.error('\nsmoke:patterns failed:', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
