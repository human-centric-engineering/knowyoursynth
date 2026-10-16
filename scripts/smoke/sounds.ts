/**
 * Smoke: users' own sounds, last panels and settings against the real dev database (`f-my-sounds` s1, s3).
 *
 *   npm run smoke:sounds            (after `npm run db:migrate:deploy` and `npm run db:seed`)
 *
 * What no unit test can prove, because unit tests have no database:
 *
 * 1. The store writes and reads real rows: a sound made from scratch, and a copy of a library sound whose credit
 *    points at the real `synth_sound` row.
 *    A last panel and the settings (s3) are kept and read back the same way.
 * 2. `exportUserData()` carries the user's sounds in its `app.sounds` section, their last panels in `app.synthPanels`
 *    and their settings in `app.synthSettings`, and nobody else's.
 * 3. `eraseUser()` erases them: the hand-written `user_sound_userId_fkey`, `synth_preference_userId_fkey` and
 *    `user_preference_userId_fkey` cascade. Another user's rows stay.
 *
 * Skips cleanly (exit 0) when no database is reachable. Self-cleaning: creates only `smoke-test-sounds-*` users, whose
 * sounds go with them, and removes whatever it created on every path. Printing goes through `console`, not `logger` —
 * see the `scripts/**` override in `eslint.config.mjs`.
 */
import { prisma } from '@/lib/db/client';
import { runAsOrg } from '@/lib/tenancy/context';
import { INSTALL_ORG_ID } from '@/lib/tenancy/constants';
import { eraseUser } from '@/lib/privacy/erase-user';
import { exportUserData } from '@/lib/privacy/export-user';
import { getSynthDef } from '@/lib/app/synths/defs';
import { createUserSound, getUserSound, listUserSounds } from '@/lib/app/sounds/store';
import {
  getPanelPref,
  getSettings,
  putPanelPref,
  updateSettings,
} from '@/lib/app/sounds/preferences';

const PREFIX = 'smoke-test-sounds';
const stamp = Date.now();

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

async function main(): Promise<void> {
  if (!(await dbReachable())) {
    console.log('smoke:sounds skipped — no database reachable (DATABASE_URL unset or DB down).');
    return;
  }
  const def = getSynthDef('model-d');
  const library = await prisma.synthSound.findFirst({
    where: { synthId: 'model-d' },
    orderBy: { order: 'asc' },
  });
  if (!def || !library)
    throw new Error('Model D and its library are not seeded: run npm run db:seed');

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
    const cont = def.controls.find((c) => c.kind === 'cont');
    if (!cont || cont.kind !== 'cont') throw new Error('Model D has no continuous control');
    const panel = { values: { [cont.id]: cont.min }, cables: [] };

    // 1. Real rows.
    const scratch = await createUserSound(subject.id, {
      synthId: 'model-d',
      name: 'Scratch',
      panel,
    });
    const copy = await createUserSound(subject.id, {
      synthId: 'model-d',
      source: { slug: library.slug },
    });
    const theirs = await createUserSound(other.id, { synthId: 'model-d', name: 'Theirs', panel });
    check(
      (await getUserSound(subject.id, scratch.id)).panel?.values[cont.id] === cont.min,
      'a sound made from scratch reads back with its panel'
    );
    check(
      copy.source?.soundId === library.id && copy.source.name === library.name && copy.playable,
      `a copy of ${library.slug} credits the library row and plays`
    );
    check(
      (await listUserSounds(subject.id))
        .map((s) => s.id)
        .sort()
        .join() === [scratch.id, copy.id].sort().join(),
      "the subject's list is their two sounds"
    );
    const last = { presetId: library.slug, step: 1, soundId: copy.id, panel };
    await putPanelPref(subject.id, 'model-d', last);
    await putPanelPref(subject.id, 'model-d', { ...last, step: 2 });
    await putPanelPref(other.id, 'model-d', last);
    await updateSettings(subject.id, { dim: true });
    await updateSettings(subject.id, { harm: true });
    await updateSettings(other.id, { dim: false });
    const pref = await getPanelPref(subject.id, 'model-d');
    check(
      pref?.step === 2 && pref.soundId === copy.id && pref.values[cont.id] === cont.min,
      'a last panel reads back as last kept, replacing the one before'
    );
    const settings = await getSettings(subject.id);
    check(
      settings.dim === true && settings.harm === true && settings.tips === null,
      'settings read back with each change kept and the rest unset'
    );

    // 2. The export.
    const bundle = await exportUserData({
      userId: subject.id,
      actorUserId: subject.id,
      reason: 'self_service',
    });
    const exported = bundle.app.sounds;
    check(
      Array.isArray(exported) &&
        exported.length === 2 &&
        exported.every((s: unknown) => typeof s === 'object' && s !== null && 'values' in s),
      "the export's app.sounds holds the subject's two sounds, with their panels"
    );
    check(!JSON.stringify(exported).includes(theirs.id), "the export holds no other user's sound");
    const panels = bundle.app.synthPanels;
    check(
      Array.isArray(panels) &&
        panels.length === 1 &&
        JSON.stringify(panels[0]).includes(`"step":2`) &&
        !JSON.stringify(panels).includes(other.id),
      "the export's app.synthPanels holds the subject's one last panel"
    );
    const kept = bundle.app.synthSettings;
    check(
      Array.isArray(kept) &&
        kept.length === 1 &&
        JSON.stringify(kept[0]).includes(`"dim":true`) &&
        JSON.stringify(kept[0]).includes(`"harm":true`),
      "the export's app.synthSettings holds the subject's settings"
    );

    // 3. The erasure.
    await eraseUser({
      userId: subject.id,
      userEmail: subject.email,
      actorUserId: subject.id,
      reason: 'self_service',
    });
    check(
      (await prisma.userSound.count({ where: { id: { in: [scratch.id, copy.id] } } })) === 0,
      'erasing the subject erases their sounds (user_sound_userId_fkey cascades)'
    );
    check(
      (await prisma.userSound.count({ where: { id: theirs.id } })) === 1,
      "another user's sound stays"
    );
    check(
      (await prisma.synthPreference.count({ where: { userId: subject.id } })) === 0 &&
        (await prisma.userPreference.count({ where: { userId: subject.id } })) === 0,
      'erasing the subject erases their last panels and settings (the s3 FKs cascade)'
    );
    check(
      (await prisma.synthPreference.count({ where: { userId: other.id } })) === 1 &&
        (await prisma.userPreference.count({ where: { userId: other.id } })) === 1,
      "another user's last panel and settings stay"
    );
    check(
      (await prisma.synthSound.count({ where: { id: library.id } })) === 1,
      'the library sound the copy credited stays'
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
  console.log('\nsmoke:sounds passed');
}

runAsOrg(INSTALL_ORG_ID, main, { source: 'job' }).catch(async (err) => {
  console.error('\nsmoke:sounds failed:', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
