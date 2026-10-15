/**
 * Read the databank's seed data from `./data/bank/` (plan §9).
 *
 * Read by the seed unit `002-bank.ts` and `scripts/check-synths.ts` only, as the catalogue's loader is: the live app
 * reads the tables (D13), and `tests/unit/lib/app/catalogue/seed-data-boundary.test.ts` fails on any other reader.
 * Not a seed unit itself: its name has no `NNN-` prefix, so the runner does not pick it up.
 */
import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import type { z } from 'zod';
import {
  BankArtistsFileSchema,
  BankInstrumentsFileSchema,
  BankMakersFileSchema,
  BankReferenceFileSchema,
  BankSongsFileSchema,
  type Bank,
} from '@/lib/app/bank/data';

/** The data folder. */
export const BANK_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'bank');

function readJson<S extends z.ZodType>(dir: string, rel: string, schema: S): z.infer<S> {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
  } catch (error) {
    throw new Error(`bank/${rel}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`bank/${rel}: ${parsed.error.message}`);
  return parsed.data;
}

/**
 * Read and shape-check the files. Whether their references resolve is the seed's check (`planBank`).
 *
 * `reference.json` is the reference list (b4): every hardware synth, compiled with a source for each. Its entries are
 * instruments like the rest, after the ones named on records.
 */
export function loadBankData(dir = BANK_DATA_DIR): Bank {
  return {
    makers: readJson(dir, 'makers.json', BankMakersFileSchema).makers,
    instruments: [
      ...readJson(dir, 'instruments.json', BankInstrumentsFileSchema).instruments,
      ...readJson(dir, 'reference.json', BankReferenceFileSchema).instruments,
    ],
    artists: readJson(dir, 'artists.json', BankArtistsFileSchema).artists,
    songs: readJson(dir, 'songs.json', BankSongsFileSchema).songs,
  };
}

/** Every data file, relative to `dir`, for the seed unit's `hashInputs`. */
export function bankDataFiles(dir = BANK_DATA_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => relative(dir, join(dir, f)));
}
