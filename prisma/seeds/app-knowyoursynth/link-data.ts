/**
 * Read the videos and links seed data from `./data/links/` (t-199): one file per owner, at `<kind>/<id>.json`. A
 * library sound's id is `<synthId>/<slug>`, so its file is `sound/<synthId>/<slug>.json`.
 *
 * Read by the seed unit `006-links.ts`, and written by `scripts/app/export-links.ts` from a database, as the catalogue
 * and databank loaders are kept: the live app reads the table, never these files
 * (`tests/unit/lib/app/catalogue/seed-data-boundary.test.ts`). Not a seed unit itself: its name has no `NNN-` prefix.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, sep } from 'path';
import { fileURLToPath } from 'url';
import { OWNER_KINDS, type OwnerRef } from '@/lib/app/links/owner-ref';
import { LinkSeedFileSchema, type LinkSeedData } from '@/lib/app/links/seed';

/** The data folder. */
export const LINK_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'links');

/** Every data file, relative to `dir` and sorted, for the seed unit's `hashInputs`. None when there is no folder. */
export function linkDataFiles(dir = LINK_DATA_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.split(sep).join('/'))
    .sort();
}

/** The owner a data file is about, from where it sits; null for a file outside the layout. */
export function ownerOfFile(rel: string): OwnerRef | null {
  const [kind, ...rest] = rel.replace(/\.json$/, '').split('/');
  const id = rest.join('/');
  const ownerKind = OWNER_KINDS.find((k) => k === kind);
  return ownerKind && id ? { kind: ownerKind, id } : null;
}

/** Where an owner's file goes, relative to the data folder. */
export const fileOfOwner = (owner: OwnerRef): string => `${owner.kind}/${owner.id}.json`;

/** Read and shape-check the files. Whether the links and owners check is the seed's (`checkLinkData`). */
export function loadLinkData(dir = LINK_DATA_DIR): LinkSeedData {
  return linkDataFiles(dir).map((rel) => {
    const owner = ownerOfFile(rel);
    if (!owner) throw new Error(`links/${rel}: not at <kind>/<id>.json`);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
    } catch (error) {
      throw new Error(`links/${rel}: ${error instanceof Error ? error.message : String(error)}`);
    }
    const parsed = LinkSeedFileSchema.safeParse(json);
    if (!parsed.success) throw new Error(`links/${rel}: ${parsed.error.message}`);
    return { owner, links: parsed.data };
  });
}
