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
import type { CablePair, Lineage, Preset } from '@/lib/app/synths/contract';
import { getSynthDef, type AppSynthDef } from '@/lib/app/synths/defs';
import { validatePreset } from '@/lib/app/synths/validate';
import { presetState } from '@/lib/app/synths/lib/patch';
import {
  departures,
  translate,
  type Changed,
  type Dropped,
} from '@/lib/app/synths/families/translate';
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
  /**
   * What sort of instrument it is (`mono`, `poly`, `module`…), from the databank instrument it models; null when it
   * models none. The picker prints it beside the year (`f-synth-picker` t-328).
   */
  kind: string | null;
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

/**
 * A family sibling's library sound, carried onto the synth through the family's map (`f-synth-families` t-322), with
 * the member it was made on and what did not come across as it was. It stays that member's: its `id` is its slug
 * there, so it is told from this synth's own by `from` as well. Its `defaultPattern` is its member's (t-326), for the
 * effects and the drum style it comes with: its id names a pattern of that member's, and it is never `played` here.
 */
export type SiblingSound = CatalogueSound & {
  from: { synthId: string; name: string };
  dropped: Dropped[];
  changed: Changed[];
};

/** One synth with everything said about it. */
export interface SynthDetail {
  synth: CatalogueSynth;
  sounds: CatalogueSound[];
  /** Its family siblings' library sounds, already carried onto it, each with the member it was made on. */
  siblingSounds: SiblingSound[];
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
  // The first by id, so a synth that models two databank instruments always reads the same kind.
  bankInstruments: {
    orderBy: { instrumentId: 'asc' },
    take: 1,
    select: { instrument: { select: { kind: true } } },
  },
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
    kind: row.bankInstruments[0]?.instrument.kind ?? null,
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

/**
 * The design a listed synth's panel draws in, or null when the catalogue does not serve it (not listed, or no
 * definition): what a picker thumbnail is drawn in, read without the rest of the catalogue.
 */
export async function getListedSynthDesign(id: string): Promise<SynthDesign | null> {
  if (!getSynthDef(id)) return null;
  const row = await prisma.synth.findFirst({
    where: { id, listed: true },
    select: { design: true },
  });
  return row ? designFromDb(row.design) : null;
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

/** The columns a sound is played from, as `validatePreset` reads them, and the synth it is on. */
const SOUND_COLUMNS = {
  synthId: true,
  slug: true,
  definitionVersion: true,
  name: true,
  ref: true,
  artist: true,
  tags: true,
  level: true,
  blurb: true,
  how: true,
  phrase: true,
  steps: true,
  context: true,
  tweaks: true,
} satisfies Prisma.SynthSoundSelect;

type SoundRow = Omit<Prisma.SynthSoundGetPayload<{ select: typeof SOUND_COLUMNS }>, 'synthId'>;

/** A sound's patterns as its default is read from them (t-224): a disabled pattern is never one, so it is not read. */
const HEAD_PATTERNS = {
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
} satisfies Prisma.SynthSound$patternsArgs;

type HeadRows = Prisma.SynthSoundGetPayload<{
  select: { patterns: typeof HEAD_PATTERNS };
}>['patterns'];

/**
 * The library pattern a sound's riff plays, as `CatalogueSound.defaultPattern` carries it, or none. `played` is left
 * out where the pattern is not loaded on this synth (a sibling's, t-326): its chain and lanes are its own member's.
 */
function defaultPatternOf(
  patterns: HeadRows,
  withPlayed = true
): CatalogueSound['defaultPattern'] | undefined {
  const parsedHead = parsedHeadOf(patterns);
  const head = parsedHead?.place ?? null;
  if (!parsedHead || !head) return undefined;
  const style = styleWordsOf({ kind: head.pattern.inspiration, label: head.pattern.inspiredBy });
  const played = withPlayed && playedDefault(parsedHead.pattern);
  // The effects the default comes with (t-302): the rack is turned to them as the sound is chosen.
  const fx = parsedHead.pattern.fx;
  return {
    id: head.patternId,
    name: head.pattern.name,
    ...(style ? { style } : {}),
    ...(played ? { played: true as const } : {}),
    ...(fx ? { fx } : {}),
  };
}

/**
 * A stored sound as its own synth plays it, or `null`, logged, when it is made on a definition version the registry
 * no longer has or fails validation on read. `quiet` logs it at debug level: a sibling's read finds the rows its own
 * synth's read already reports as errors, and would otherwise report each one again on every member's page.
 */
function validSound(def: AppSynthDef, s: SoundRow, quiet = false): Preset | null {
  const report = (message: string, meta: Record<string, unknown>): void =>
    quiet ? logger.debug(message, meta) : logger.error(message, meta);
  if (s.definitionVersion !== def.version) {
    report('catalogue: sound made on a definition version the registry does not have', {
      synthId: def.id,
      sound: s.slug,
      version: s.definitionVersion,
      current: def.version,
    });
    return null;
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
    report('catalogue: stored sound fails validation, not served', {
      synthId: def.id,
      sound: s.slug,
      problems: result.problems,
    });
    return null;
  }
  return result.value;
}

/**
 * Each sibling's library sounds, carried onto `def` through the family's map (`translate()`), in toggle order then
 * library order (t-322). A sound is first read as its own synth serves it, then its whole panel is translated and the
 * result checked against `def` as a stored sound is: one that fails is left out and logged.
 *
 * What is served is the sound's panel, not its lesson: a lesson's steps name the controls of the member it was written
 * for, so the carried sound has one step, the panel as it came across. Its context and tweaks name those controls too,
 * and stay behind with the lesson. Its riff comes with it, and so do its default pattern's effects and drum style
 * (t-326), which the rack and the drums' Match are turned to as it is chosen, as for one of this synth's own.
 */
async function readSiblingSounds(def: AppSynthDef, family: SynthFamily): Promise<SiblingSound[]> {
  const siblings = family.members.flatMap((m) => {
    const sib = m.synthId && m.synthId !== def.id ? getSynthDef(m.synthId) : undefined;
    return sib ? [sib] : [];
  });
  if (!siblings.length) return [];
  const rows = await prisma.synthSound.findMany({
    where: { synthId: { in: siblings.map((d) => d.id) }, synth: { listed: true } },
    orderBy: [{ order: 'asc' }, { slug: 'asc' }],
    select: { ...SOUND_COLUMNS, patterns: HEAD_PATTERNS },
  });
  const out: SiblingSound[] = [];
  for (const from of siblings) {
    for (const row of rows) {
      if (row.synthId !== from.id) continue;
      const source = validSound(from, row, true);
      if (!source) continue;
      const sibling = carriedSound(from, def, source, defaultPatternOf(row.patterns, false));
      if (sibling) out.push(sibling);
    }
  }
  return out;
}

/** One sibling's sound carried onto `to`, or `null`, logged, when what came across fails validation there. */
function carriedSound(
  from: AppSynthDef,
  to: AppSynthDef,
  source: Preset,
  defaultPattern: CatalogueSound['defaultPattern'] | undefined
): SiblingSound | null {
  const panel = presetState(from, source);
  const carry = translate(
    panel.values,
    panel.cables.map((c): CablePair => [c.from, c.to]),
    from,
    to
  );
  // The carried panel replaces the member's Default patch, cables and all, as the version toggle's carry does. The step
  // names only what differs from it, so showing the step lights and turns what the sound changes, not every control.
  // The baseline is the Default patch as this sound starts from it, its riff's tempo included where TEMPO follows it.
  const start = presetState(to, { steps: [], phrase: source.phrase });
  const set = Object.fromEntries(
    Object.entries(carry.values).filter(([k, v]) => start.values[k] !== v)
  );
  const key = ([a, b]: CablePair): string => `${a}>${b}`;
  const carried = new Set(carry.cables.map(key));
  const base = start.cables.map((c): CablePair => [c.from, c.to]);
  const unplug = base.filter((c) => !carried.has(key(c)));
  const kept = new Set(base.map(key));
  const cables = carry.cables.filter((c) => !kept.has(key(c)));
  const result = validatePreset(to, {
    id: source.id,
    name: source.name,
    ref: source.ref,
    artist: source.artist,
    tags: source.tags,
    level: source.level,
    blurb: source.blurb,
    how: source.how,
    phrase: source.phrase,
    steps: [
      {
        title: `Set the panel as it was on the ${from.name}`,
        module: source.steps[0].module,
        why: `This patch was made on the ${from.name}. Its lesson names the ${from.name}'s controls, so it stays there: here the whole panel is set at once, as it came across.`,
        set,
        ...(unplug.length ? { unplug } : {}),
        ...(cables.length ? { cables } : {}),
      },
    ],
  });
  if (!result.ok) {
    logger.error('catalogue: a sibling sound fails validation once carried, not served', {
      synthId: to.id,
      from: from.id,
      sound: source.id,
      problems: result.problems,
    });
    return null;
  }
  return {
    ...result.value,
    version: to.version,
    ...(defaultPattern ? { defaultPattern } : {}),
    from: { synthId: from.id, name: from.name },
    // what the note names: only what the sound moved from its member's Default patch (t-326)
    ...departures(from, carry),
  };
}

/** One listed synth with its sounds, lineage and notes, or `null` when no listed, playable synth has that id. */
export async function getSynthDetail(id: string): Promise<SynthDetail | null> {
  const def = getSynthDef(id);
  if (!def) return null;
  const [row, noteRows, heardOn, links, soundLinks, { family, siblingSounds }] = await Promise.all([
    prisma.synth.findFirst({
      where: { id, listed: true },
      select: {
        ...synthColumns,
        sounds: {
          orderBy: [{ order: 'asc' }, { slug: 'asc' }],
          include: {
            // what its default is read from, as the sound's patterns read it, to name the riff it plays (t-224); a
            // disabled pattern is never one, so it is not read
            patterns: HEAD_PATTERNS,
          },
        },
        lineage: true,
        bankInstruments: {
          select: { instrument: { select: { id: true, name: true, kind: true } } },
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
    getFamilyOf(id)
      .catch((err: unknown) => {
        logger.warn('catalogue: could not read the synth family, served without one', {
          synthId: id,
          err: String(err),
        });
        return null;
      })
      // Its siblings' sounds only add to the library: a failed read serves the synth with its own alone.
      .then(async (family) => ({
        family,
        siblingSounds: family
          ? await readSiblingSounds(def, family).catch((err: unknown) => {
              logger.warn('catalogue: could not read the sibling sounds, served without them', {
                synthId: id,
                err: String(err),
              });
              return [];
            })
          : [],
      })),
  ]);
  if (!row) return null;
  const { sounds: soundRows, lineage: lineageRow, bankInstruments, ...synthRow } = row;
  const synth = toCatalogueSynth({ ...synthRow, bankInstruments }, def);

  const sounds: CatalogueSound[] = [];
  for (const s of soundRows) {
    const preset = validSound(def, s);
    if (!preset) continue;
    const defaultPattern = defaultPatternOf(s.patterns);
    sounds.push({
      ...preset,
      version: s.definitionVersion,
      ...(defaultPattern ? { defaultPattern } : {}),
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

  const instruments = bankInstruments.map(({ instrument: { id, name } }) => ({ id, name }));
  return {
    synth,
    sounds,
    siblingSounds,
    lineage,
    notes,
    links,
    soundLinks,
    instruments,
    family,
  };
}
