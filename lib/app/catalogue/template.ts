/**
 * A template for one synth's content (`f-catalogue-admin`, t-32): the shape an admin prepares sounds, lineage and
 * notes in, which the content upload (c4) takes back.
 *
 * Two parts, both generated from the seed's own schemas rather than written out by hand, so neither can drift from
 * what the seed and the upload check:
 *
 * - **The JSON Schema** of `SynthContentSchema`, for an editor to check a file against as it is written.
 * - **A synth's content**, read from the tables and shaped as `SynthContentSchema`: what it has now, to start from.
 *   A synth with nothing yet gives the empty skeleton. It is parsed through the schema before it is returned, and
 *   anything that does not fit is reported beside it rather than dropped.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { getSynthDef } from '@/lib/app/synths/defs';
import { SynthContentSchema, type SynthContent } from '@/lib/app/catalogue/data';

/** The JSON Schema of one synth's content object. */
export function synthContentJsonSchema(): Record<string, unknown> {
  return {
    title: 'Know Your Synth: one synth’s content',
    ...z.toJSONSchema(SynthContentSchema, { io: 'input' }),
  };
}

/**
 * The synth's content as the schema shapes it. When a stored row does not fit, the content is the draft as it stands,
 * unchecked, with every place it does not fit, so the admin can see and fix what the schema refused.
 */
export type SynthContentTemplate =
  | { content: SynthContent; problems: [] }
  | { content: unknown; problems: { path: string; message: string }[] };

/**
 * One synth's content from the tables. `null` when no synth has the id. The version is the definition's current one
 * (for a synth the registry lacks, its first sound's, or 1); a sound stored on another version is reported, since the
 * object says one version for all of them.
 */
export async function getSynthContentTemplate(id: string): Promise<SynthContentTemplate | null> {
  const synth = await prisma.synth.findUnique({
    where: { id },
    include: {
      sounds: { orderBy: [{ order: 'asc' }, { slug: 'asc' }] },
      lineage: true,
      notes: { orderBy: [{ order: 'asc' }, { key: 'asc' }] },
    },
  });
  if (!synth) return null;

  const version = getSynthDef(id)?.version ?? synth.sounds[0]?.definitionVersion ?? 1;
  const notesOf = (kind: 'UNUSUAL' | 'LIMIT_INTRO' | 'LIMIT') =>
    synth.notes.filter((n) => n.kind === kind);
  const intro = notesOf('LIMIT_INTRO')[0];
  const draft = {
    synth: synth.id,
    version,
    sounds: synth.sounds.map((s) => ({
      id: s.slug,
      name: s.name,
      ref: s.ref,
      artist: s.artist,
      tags: s.tags,
      level: s.level,
      blurb: s.blurb,
      how: s.how,
      phrase: s.phrase,
      steps: s.steps,
      context: s.context,
      tweaks: s.tweaks,
    })),
    ...(synth.lineage
      ? {
          lineage: {
            title: synth.lineage.title,
            intro: synth.lineage.intro,
            timeline: synth.lineage.timeline,
            relatives: synth.lineage.relatives,
            ...(synth.lineage.users.length ? { users: synth.lineage.users } : {}),
            ...(synth.lineage.note ? { note: synth.lineage.note } : {}),
          },
        }
      : {}),
    ...(synth.notes.length
      ? {
          notes: {
            unusual: notesOf('UNUSUAL').map((n) => ({ target: n.target, text: n.text })),
            limits: {
              intro: intro?.text ?? '',
              items: notesOf('LIMIT').map((n) => ({ title: n.title, text: n.text })),
            },
          },
        }
      : {}),
  };

  const problems = synth.sounds.flatMap((s, i) =>
    s.definitionVersion === version
      ? []
      : [
          {
            path: `sounds.${i}`,
            message: `${s.slug} was made on definition version ${s.definitionVersion}, not ${version}`,
          },
        ]
  );
  const parsed = SynthContentSchema.safeParse(draft);
  if (parsed.success && !problems.length) return { content: parsed.data, problems: [] };
  if (!parsed.success)
    problems.push(
      ...parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
    );
  return { content: draft, problems };
}
