/**
 * The databank's shapes: the four JSON files `prototype/tools/export-content.mjs --bank` writes under
 * `prisma/seeds/app-knowyoursynth/data/bank/`, which are the prototype's `src/bank/*.js` as they were
 * (`prototype/CONTRACT.md` → Databank). The read layer hands rows back in the same shapes, so the joins in
 * `lib/app/bank/joins.ts` read one form whether it came from the files or the tables.
 *
 * Shapes only. Whether the references resolve is the seed's check (`planBank`), as it was `checkBank`'s in the
 * prototype. This module never reads the files (D13).
 */
import { z } from 'zod';

const text = z.string().trim().min(1);
const texts = z.array(text);

/** A web link: http or https only, so an admin or reader can follow it safely. */
export const WebLinkSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isWebLink, 'must be a web address starting with http:// or https://');

function isWebLink(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Ids are lowercase words joined by hyphens (`checkBank`'s rule), so they can sit in a URL as they are. */
export const BankIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'must be lowercase letters, digits and hyphens');

/**
 * What an instrument is. Text in the table and checked here, so a new kind is a code change, not a migration: a
 * Eurorack kind is expected after the first release (owner ruling, 2026-10-13).
 */
export const INSTRUMENT_KINDS = [
  'mono',
  'poly',
  'paraphonic',
  'modular',
  'semi-modular',
  'module',
  'sequencer',
] as const;

/** `body` is a body of work with no single record to name. */
export const SONG_KINDS = ['song', 'album', 'score', 'body', 'performance'] as const;

export const ARTIST_KINDS = ['person', 'group'] as const;

export const BankMakerSchema = z.object({
  id: BankIdSchema,
  name: text,
  born: text.optional(),
  died: text.optional(),
  country: text,
  companies: texts,
  summary: text,
  story: text,
  innovations: texts,
});

export const BankInstrumentSchema = z.object({
  id: BankIdSchema,
  name: text,
  /** The company, as text. */
  maker: text,
  year: text,
  kind: z.enum(INSTRUMENT_KINDS),
  /** Maker ids: the designers and founders behind it. */
  people: texts.optional(),
  /** App synths that model it. */
  app: texts.optional(),
  /** The instrument id of the original this one recreates. */
  recreationOf: BankIdSchema.optional(),
  text,
  /** Where its facts were checked. */
  source: WebLinkSchema.optional(),
});

/**
 * An entry in the reference list (b4, `reference.json`): any hardware synth, beside the instruments named on records.
 * Every entry says where its facts were checked. None lists app synths, so "Heard on" stays with the originals.
 */
export const BankReferenceInstrumentSchema = BankInstrumentSchema.omit({ app: true })
  .extend({ source: WebLinkSchema })
  .strict();

export const BankArtistSchema = z.object({
  id: BankIdSchema,
  name: text,
  kind: z.enum(ARTIST_KINDS),
  members: texts.optional(),
  memberOf: texts.optional(),
  country: text,
  active: text,
  eras: texts,
  genres: texts,
  roles: texts,
  summary: text,
  story: text,
  innovations: texts,
  /** Instruments they are known to have used beyond the records listed (those are joined in). */
  instruments: texts.optional(),
});

export const BankPartSchema = z.object({
  instruments: texts.min(1),
  on: text,
  player: text.optional(),
  /** Extra app synths to list the work under. */
  synths: texts.optional(),
  /** App synth id → a library sound in this style. */
  sounds: z.record(z.string(), text).optional(),
  text,
  /** App synth id → the text shown in that synth's list instead of `text`. */
  notes: z.record(z.string(), text).optional(),
});

export const BankSongSchema = z.object({
  id: BankIdSchema,
  title: text,
  kind: z.enum(SONG_KINDS),
  year: text.optional(),
  album: text.optional(),
  artists: texts.min(1),
  /** The printed credit, when the names alone lose something. */
  credit: text.optional(),
  parts: z.array(BankPartSchema).min(1),
});

export type BankMaker = z.infer<typeof BankMakerSchema>;
export type BankInstrument = z.infer<typeof BankInstrumentSchema>;
export type BankArtist = z.infer<typeof BankArtistSchema>;
export type BankPart = z.infer<typeof BankPartSchema>;
export type BankSong = z.infer<typeof BankSongSchema>;

export const BankMakersFileSchema = z.object({ makers: z.array(BankMakerSchema) });
export const BankInstrumentsFileSchema = z.object({ instruments: z.array(BankInstrumentSchema) });
export const BankArtistsFileSchema = z.object({ artists: z.array(BankArtistSchema) });
export const BankSongsFileSchema = z.object({ songs: z.array(BankSongSchema) });
export const BankReferenceFileSchema = z.object({
  instruments: z.array(BankReferenceInstrumentSchema),
});

/** The whole databank, or any part of it the joins need. */
export interface Bank {
  makers: BankMaker[];
  instruments: BankInstrument[];
  artists: BankArtist[];
  songs: BankSong[];
}
