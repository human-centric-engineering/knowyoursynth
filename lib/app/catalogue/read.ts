/**
 * Read the catalogue for the public API (`GET /api/v1/synths`, `GET /api/v1/synths/[id]`).
 *
 * The tables are the only source (D13). A synth is served only when it is listed **and** its definition is in the
 * registry, because a listed synth the app cannot play is a broken page, not a catalogue entry.
 *
 * Every sound is validated on read as well as on write (plan §5): a row edited into a shape its definition rejects,
 * or made on a definition version the registry no longer has, is left out and logged rather than sent to a panel that
 * cannot play it.
 */
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import type { Lineage, Preset } from '@/lib/app/synths/contract';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { validatePreset } from '@/lib/app/synths/validate';
import { designFromDb, type SynthDesign } from '@/lib/app/catalogue/designs';
import { getHeardOn } from '@/lib/app/bank/read';
import { getFamilyOf, type SynthFamily } from '@/lib/app/families/read';
import { ENABLED, parsedHeadOf, playedDefault, PLACES } from '@/lib/app/patterns/library';
import { styleWordsOf } from '@/lib/app/sequencer/drums';
import type { PatternFx } from '@/lib/app/sequencer/pattern';
import {
  summarisePublicLinks,
  summariseSongLinks,
  summariseSoundLinks,
  type LinkSummary,
} from '@/lib/app/links/read';
import {
  LimitSchema,
  LineageEntrySchema,
  LineageRelativeSchema,
  noteTargets,
} from '@/lib/app/catalogue/data';

/** A synth as the catalogue lists it. */
export interface CatalogueSynth {
  id: string;
  name: string;
  maker: string;
  year: number;
  heritage: string;
  summary: string;
  /** Which design the panel draws (D11): `faithful` shows the maker's marks, `neutral` leaves them out. */
  design: SynthDesign;
  /** The definition's current version; a sound saved now records it. */
  definitionVersion: number;
  /**
   * Sounds stored for the synth. The detail can serve fewer: it leaves out any that fail validation on read, and
   * each of those is logged as an error.
   */
  soundCount: number;
}

/**
 * A library sound, as the panel plays it. `defaultPattern` is the library pattern its riff plays (t-224), by the rule
 * that keeps the riff in step with it (`headOf`): what Play names the riff, and which of the sound's patterns the
 * picker and the sequencer take for it. None when it has no default, when it plays its riff as it has it, named for
 * the sound. Its `style` is the words of its Inspired by that say its style (`styleWordsOf`), what the drums' Match
 * goes by for the riff (t-267); absent for a work or a synth. `played` marks a default that plays more than its riff
 * (a chained part B, or mod lanes: `playedDefault`, t-300), which the page loads into the sequencer as the sound is
 * picked, so Play plays it whole; absent otherwise. `fx` is the effects the default comes with (t-302), which the rack
 * is turned to as the sound is chosen; absent for one that brings none, when the rack is turned off.
 */
export type CatalogueSound = Preset & {
  version: number;
  defaultPattern?: { id: string; name: string; style?: string; played?: true; fx?: PatternFx };
};

export type Limit = z.infer<typeof LimitSchema>;

/** One synth with everything said about it. */
export interface SynthDetail {
  synth: CatalogueSynth;
  sounds: CatalogueSound[];
  lineage: Lineage | null;
  notes: {
    /** Control, jack or area id → "Unusual on…" note. */
    unusual: Record<string, string>;
    /** "What is not modelled": this synth's intro and entries, then the entries true of every panel. */
    limits: { intro: string | null; items: Limit[]; shared: Limit[] };
  };
  /**
   * Its databank instruments' videos and links, counted (`f-videos-and-links`): what the section under the panel
   * says before it is opened. The list itself is `GET /api/v1/links?synth=`, read when it is.
   */
  links: LinkSummary;
  /**
   * Each library sound's videos and links, counted, by slug: its own and its inspiration's (t-183). A sound with none
   * is not in it. The list is `GET /api/v1/links?sound=<synth>/<slug>`.
   */
  soundLinks: Record<string, LinkSummary>;
  /**
   * The databank instruments it models, by id: what a link suggested from under its panel is about, since its videos
   * are theirs (`f-link-suggestions` t-186). Every synth has at least one.
   */
  instruments: { id: string; name: string }[];
  /**
   * The family it is a member of, with every member served (`f-synth-families`): what the picker groups it under and
   * the version toggle switches between. Null when it is in none.
   */
  family: SynthFamily | null;
}

const synthColumns = {
  id: true,
  name: true,
  maker: true,
  year: true,
  heritage: true,
  summary: true,
  design: true,
  _count: { select: { sounds: true } },
} satisfies Prisma.SynthSelect;

type SynthRow = Prisma.SynthGetPayload<{ select: typeof synthColumns }>;

function toCatalogueSynth(row: SynthRow, def: AppSynthDef): CatalogueSynth {
  const { id, name, maker, year, heritage, summary } = row;
  return {
    id,
    name,
    maker,
    year,
    heritage,
    summary,
    design: designFromDb(row.design),
    definitionVersion: def.version,
    soundCount: row._count.sounds,
  };
}

/** Every listed synth the app can play, in catalogue order. */
export async function listSynths(): Promise<CatalogueSynth[]> {
  const rows = await prisma.synth.findMany({
    where: { listed: true },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
    select: synthColumns,
  });
  return rows.flatMap((row) => {
    const def = getSynthDef(row.id);
    if (def) return [toCatalogueSynth(row, def)];
    logger.warn('catalogue: listed synth has no definition, not served', { synthId: row.id });
    return [];
  });
}

const LineageColumnsSchema = z.object({
  timeline: z.array(LineageEntrySchema),
  relatives: z.array(LineageRelativeSchema),
});

/**
 * The names of every listed synth's library sounds, by synth then sound id: what the databank's "Load a sound in this
 * style" links print. Only sounds made on the definition the registry has, as the detail serves; the detail can still
 * leave out one that fails validation, and a link to that sound then opens the synth on its first sound.
 */
export async function listSoundNames(): Promise<Record<string, Record<string, string>>> {
  const rows = await prisma.synthSound.findMany({
    where: { synth: { listed: true } },
    orderBy: [{ synthId: 'asc' }, { order: 'asc' }, { slug: 'asc' }],
    select: { synthId: true, slug: true, name: true, definitionVersion: true },
  });
  const names: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    if (getSynthDef(r.synthId)?.version !== r.definitionVersion) continue;
    (names[r.synthId] ??= {})[r.slug] = r.name;
  }
  return names;
}

/** One listed synth with its sounds, lineage and notes, or `null` when no listed, playable synth has that id. */
export async function getSynthDetail(id: string): Promise<SynthDetail | null> {
  const def = getSynthDef(id);
  if (!def) return null;
  const [row, noteRows, heardOn, links, soundLinks, family] = await Promise.all([
    prisma.synth.findFirst({
      where: { id, listed: true },
      select: {
        ...synthColumns,
        sounds: {
          orderBy: [{ order: 'asc' }, { slug: 'asc' }],
          include: {
            // what its default is read from, as the sound's patterns read it, to name the riff it plays (t-224); a
            // disabled pattern is never one, so it is not read
            patterns: {
              ...PLACES,
              where: { pattern: ENABLED },
              select: {
                ...PLACES.select,
                pattern: {
                  select: {
                    ...PLACES.select.pattern.select,
                    name: true,
                    inspiration: true,
                    inspiredBy: true,
                  },
                },
              },
            },
          },
        },
        lineage: true,
        bankInstruments: {
          select: { instrument: { select: { id: true, name: true } } },
          orderBy: { instrumentId: 'asc' },
        },
      },
    }),
    prisma.synthNote.findMany({
      where: { OR: [{ synthId: id }, { synthId: null, kind: 'LIMIT' }] },
      orderBy: [{ order: 'asc' }, { key: 'asc' }],
      select: { kind: true, synthId: true, target: true, title: true, text: true },
    }),
    // "Heard on" is the databank's, joined into the lineage as the contract shapes it (`f-databank`), each song with
    // its links counted (`f-videos-and-links` t-183).
    getHeardOn(id).then(async (h) => {
      const counted = await summariseSongLinks(h.heard.map((e) => e.song));
      return {
        ...h,
        heard: h.heard.map((e) => {
          const songLinks = counted.get(e.song);
          return songLinks ? { ...e, links: songLinks } : e;
        }),
      };
    }),
    summarisePublicLinks({ target: 'synth', id }),
    summariseSoundLinks(id),
    // A family only adds the version toggle: a failed read opens the synth without one rather than failing it.
    getFamilyOf(id).catch((err: unknown) => {
      logger.warn('catalogue: could not read the synth family, served without one', {
        synthId: id,
        err: String(err),
      });
      return null;
    }),
  ]);
  if (!row) return null;
  const { sounds: soundRows, lineage: lineageRow, bankInstruments, ...synthRow } = row;
  const synth = toCatalogueSynth(synthRow, def);

  const sounds: CatalogueSound[] = [];
  for (const s of soundRows) {
    if (s.definitionVersion !== def.version) {
      logger.error('catalogue: sound made on a definition version the registry does not have', {
        synthId: id,
        sound: s.slug,
        version: s.definitionVersion,
        current: def.version,
      });
      continue;
    }
    const result = validatePreset(def, {
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
    });
    if (!result.ok) {
      logger.error('catalogue: stored sound fails validation, not served', {
        synthId: id,
        sound: s.slug,
        problems: result.problems,
      });
      continue;
    }
    const parsedHead = parsedHeadOf(s.patterns);
    const head = parsedHead?.place ?? null;
    const style = head
      ? styleWordsOf({ kind: head.pattern.inspiration, label: head.pattern.inspiredBy })
      : null;
    const played = !!parsedHead && playedDefault(parsedHead.pattern);
    // The effects the default comes with (t-302): the rack is turned to them as the sound is chosen.
    const fx = parsedHead?.pattern.fx;
    sounds.push({
      ...result.value,
      version: s.definitionVersion,
      ...(head
        ? {
            defaultPattern: {
              id: head.patternId,
              name: head.pattern.name,
              ...(style ? { style } : {}),
              ...(played ? { played: true as const } : {}),
              ...(fx ? { fx } : {}),
            },
          }
        : {}),
    });
  }

  let lineage: Lineage | null = null;
  if (lineageRow) {
    const parsed = LineageColumnsSchema.safeParse(lineageRow);
    if (parsed.success) {
      lineage = {
        title: lineageRow.title,
        intro: lineageRow.intro,
        ...parsed.data,
        heard: heardOn.heard,
        ...(heardOn.artists.length ? { heardArtists: heardOn.artists } : {}),
        ...(lineageRow.users.length ? { users: lineageRow.users } : {}),
        ...(lineageRow.note ? { note: lineageRow.note } : {}),
      };
    } else {
      logger.error('catalogue: stored lineage is malformed, not served', {
        synthId: id,
        problems: parsed.error.issues,
      });
    }
  }

  // An unusual note is checked against the definition as a sound is: one on something the synth no longer has is
  // left out rather than attached to nothing.
  const targets = noteTargets(def);
  const notes: SynthDetail['notes'] = {
    unusual: {},
    limits: { intro: null, items: [], shared: [] },
  };
  for (const n of noteRows) {
    if (n.kind === 'UNUSUAL' && n.target) {
      if (targets.has(n.target)) notes.unusual[n.target] = n.text;
      else
        logger.error('catalogue: unusual note on something the synth does not have, not served', {
          synthId: id,
          target: n.target,
        });
    } else if (n.kind === 'LIMIT_INTRO') notes.limits.intro = n.text;
    else if (n.kind === 'LIMIT' && n.title)
      (n.synthId ? notes.limits.items : notes.limits.shared).push({ title: n.title, text: n.text });
  }

  const instruments = bankInstruments.map((b) => b.instrument);
  return { synth, sounds, lineage, notes, links, soundLinks, instruments, family };
}
