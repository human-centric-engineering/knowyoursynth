/**
 * Smoke: users' own sounds, last panels, settings, lesson progress and favourites against the real dev database
 * (`f-my-sounds` s1, s3, s4).
 *
 *   npm run smoke:sounds            (after `npm run db:migrate:deploy` and `npm run db:seed`)
 *
 * What no unit test can prove, because unit tests have no database:
 *
 * 1. The store writes and reads real rows: a sound made from scratch, and a copy of a library sound whose credit
 *    points at the real `synth_sound` row.
 *    A last panel and the settings (s3) are kept and read back the same way, and lesson progress and favourites (s4),
 *    whose rows point at real `synth_sound`, `synth` and `user_sound` rows.
 * 2. `exportUserData()` carries the user's sounds in its `app.sounds` section, their last panels in `app.synthPanels`
 *    their settings in `app.synthSettings`, their lesson progress in `app.lessonProgress` and their favourites in
 *    `app.favourites`, and nobody else's.
 * 3. `eraseUser()` erases them: the hand-written `user_sound_userId_fkey`, `synth_preference_userId_fkey`,
 *    `user_preference_userId_fkey`, `lesson_progress_userId_fkey` and `favourite_userId_fkey` cascade. Another user's
 *    rows stay.
 * 4. Sharing (`f-sharing` h1): a published sound is served by its slug and copied with credit; the export carries its
 *    visibility and slug; erasing its author keeps the other user's copy with no credit left
 *    (`user_sound_sourceUserSoundId_fkey`, `ON DELETE SET NULL`). Publishes sent together at the daily cap are
 *    counted one after another (the owner's `FOR UPDATE` lock), and deleting a published sound does not give its
 *    place back.
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
import { APIError } from '@/lib/api/errors';
import {
  createUserSound,
  deleteUserSound,
  getUserSound,
  listUserSounds,
  updateUserSound,
} from '@/lib/app/sounds/store';
import { PUBLISH_DAILY_CAP, publishUserSound } from '@/lib/app/sounds/publish';
import { getSharedSound } from '@/lib/app/sounds/public';
import {
  getPanelPref,
  getSettings,
  putPanelPref,
  updateSettings,
} from '@/lib/app/sounds/preferences';
import { listProgress, recordProgress } from '@/lib/app/sounds/progress';
import { addFavourite, listFavourites } from '@/lib/app/sounds/favourites';

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
  const lastStep = (Array.isArray(library.steps) ? library.steps.length : 0) - 1;
  if (lastStep < 1) throw new Error(`${library.slug} has fewer than two lesson steps`);

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

    // 4. Sharing: the subject publishes under a username, and the other user copies it.
    await prisma.synthProfile.create({
      data: { userId: subject.id, username: `smk${String(stamp).slice(-12)}` },
    });
    await publishUserSound(subject.id, scratch.id, { confirm: true, tags: [] });
    const published = await getUserSound(subject.id, scratch.id);
    const servedShared = published.slug ? await getSharedSound(published.slug) : null;
    check(
      published.visibility === 'published' && servedShared?.name === 'Scratch',
      'a published sound is served by its slug'
    );
    const theirCopy = await createUserSound(other.id, {
      synthId: 'model-d',
      source: { shared: published.slug ?? '' },
    });
    check(
      theirCopy.basedOn?.slug === published.slug,
      "the other user's copy credits the published sound"
    );
    await updateUserSound(subject.id, scratch.id, { visibility: 'link' });
    check(
      (await getUserSound(other.id, theirCopy.id)).basedOn === null,
      'the credit goes when the source is no longer published'
    );
    await publishUserSound(subject.id, scratch.id, { confirm: true, tags: [] });

    // The cap under the owner's lock: one place left, three publishes at once, and exactly one gets it. Then deleting
    // the one that did does not give its place back. Deleted after, so the export below sees only the two sounds.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.synthProfile.update({
      where: { userId: subject.id },
      data: { recentPublishes: Array.from({ length: PUBLISH_DAILY_CAP - 1 }, () => hourAgo) },
    });
    const racers = await Promise.all(
      [cont.min, cont.max, (cont.min + cont.max) / 2].map((v, i) =>
        createUserSound(subject.id, {
          synthId: 'model-d',
          name: `Racer ${i}`,
          panel: { values: { [cont.id]: v }, cables: [] },
        })
      )
    );
    const raced = await Promise.allSettled(
      racers.map((r) => publishUserSound(subject.id, r.id, { confirm: true }))
    );
    const limited = raced.filter(
      (r) =>
        r.status === 'rejected' && r.reason instanceof APIError && r.reason.code === 'PUBLISH_LIMIT'
    );
    check(
      raced.filter((r) => r.status === 'fulfilled').length === 1 && limited.length === 2,
      'publishes sent together at the cap: one is published, the others refused (the owner lock)'
    );
    for (const r of racers) await deleteUserSound(subject.id, r.id);
    const after = await createUserSound(subject.id, { synthId: 'model-d', name: 'After', panel });
    const refusedAfter = await publishUserSound(subject.id, after.id, { confirm: true }).then(
      () => null,
      (err: unknown) => (err instanceof APIError ? err.code : 'other')
    );
    await deleteUserSound(subject.id, after.id);
    check(
      refusedAfter === 'PUBLISH_LIMIT',
      'deleting a published sound does not give its place back'
    );

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
    const { panel: pref } = await getPanelPref(subject.id, 'model-d');
    check(
      pref?.step === 2 && pref.soundId === copy.id && pref.values[cont.id] === cont.min,
      'a last panel reads back as last kept, replacing the one before'
    );
    const settings = await getSettings(subject.id);
    check(
      settings.dim === true && settings.harm === true && settings.tips === null,
      'settings read back with each change kept and the rest unset'
    );
    const reached = await recordProgress(subject.id, 'model-d', library.slug, { step: lastStep });
    const behind = await recordProgress(subject.id, 'model-d', library.slug, { step: 0 });
    check(
      behind.updatedAt === reached.updatedAt,
      'a step behind the furthest leaves the lesson as it was, its updatedAt included'
    );
    await recordProgress(subject.id, 'model-d', library.slug, { step: lastStep, completed: true });
    await recordProgress(other.id, 'model-d', library.slug, { step: 0 });
    const lessons = await listProgress(subject.id);
    check(
      lessons.length === 1 &&
        lessons[0].furthestStep === lastStep &&
        lessons[0].completedAt !== null,
      'lesson progress reads back at its furthest step and finished, an earlier step not moving it back'
    );
    await addFavourite(subject.id, { kind: 'synth', synthId: 'model-d' });
    await addFavourite(subject.id, { kind: 'sound', synthId: 'model-d', slug: library.slug });
    await addFavourite(subject.id, { kind: 'mine', soundId: copy.id });
    const again = await addFavourite(subject.id, { kind: 'synth', synthId: 'model-d' });
    await addFavourite(other.id, { kind: 'mine', soundId: theirs.id });
    check(
      !again.created &&
        (await listFavourites(subject.id))
          .map((f) => f.kind)
          .sort()
          .join() === 'mine,sound,synth',
      'favourites read back as one star each on a synth, a library sound and an own sound'
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
    check(
      JSON.stringify(exported).includes(`"slug":"${published.slug}"`) &&
        JSON.stringify(exported).includes('"visibility":"published"'),
      "the export carries the published sound's visibility and slug"
    );
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
    const progressOut = bundle.app.lessonProgress;
    check(
      Array.isArray(progressOut) &&
        progressOut.length === 1 &&
        JSON.stringify(progressOut[0]).includes(`"slug":"${library.slug}"`),
      "the export's app.lessonProgress holds the subject's one lesson"
    );
    const favouritesOut = bundle.app.favourites;
    check(
      Array.isArray(favouritesOut) &&
        favouritesOut.length === 3 &&
        !JSON.stringify(favouritesOut).includes(theirs.id),
      "the export's app.favourites holds the subject's three stars and nobody else's"
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
      (await prisma.lessonProgress.count({ where: { userId: subject.id } })) === 0 &&
        (await prisma.favourite.count({ where: { userId: subject.id } })) === 0,
      'erasing the subject erases their lesson progress and favourites (the s4 FKs cascade)'
    );
    check(
      (await prisma.lessonProgress.count({ where: { userId: other.id } })) === 1 &&
        (await prisma.favourite.count({ where: { userId: other.id } })) === 1,
      "another user's lesson progress and favourite stay"
    );
    check(
      (await prisma.synthSound.count({ where: { id: library.id } })) === 1,
      'the library sound the copy credited stays'
    );
    const orphan = await prisma.userSound.findUnique({ where: { id: theirCopy.id } });
    check(
      orphan !== null && orphan.sourceUserSoundId === null,
      "the other user's copy of the subject's sound stays, its source set null"
    );
    check((await getUserSound(other.id, theirCopy.id)).basedOn === null, 'and it credits nobody');
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
