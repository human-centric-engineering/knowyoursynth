/**
 * What the family pages load (`f-synth-families` t-323), through the admin API an API client reads, as the catalogue
 * pages do: the families (`GET /api/v1/admin/synths/families`), and the app synths and databank instruments a member
 * can name (`GET /api/v1/admin/synths`, `GET /api/v1/admin/bank/instruments`). Each is `null` when it could not be
 * loaded, and a family `'missing'` for a 404 or an id no family could have. Cached per request, so a page and its `generateMetadata` share a fetch.
 */
import { cache } from 'react';

import { parseApiResponse, serverFetch } from '@/lib/api/server-fetch';
import type { AdminBankRow } from '@/lib/app/bank/admin';
import type { AdminSynth } from '@/lib/app/catalogue/edit';
import { FamilySlugSchema } from '@/lib/app/families/data';
import type { AdminFamily } from '@/lib/app/families/edit';
import type { FamilyFormOptions } from '@/components/app/admin/catalogue/family-form';
import { logger } from '@/lib/logging';

async function load<T>(path: string): Promise<T | 'missing' | null> {
  try {
    const res = await serverFetch(path);
    if (res.status === 404) return 'missing';
    if (!res.ok) return null;
    const body = await parseApiResponse<T>(res);
    return body.success ? body.data : null;
  } catch (err) {
    logger.error('family admin: fetch failed', err, { path });
    return null;
  }
}

const listOrNull = <T>(value: T[] | 'missing' | null): T[] | null =>
  Array.isArray(value) ? value : null;

export const getAdminFamilies = cache(async () =>
  listOrNull(await load<AdminFamily[]>('/api/v1/admin/synths/families'))
);

/** An id no family could have is `'missing'` too: the endpoint would answer it 400, which no reload mends. */
export const getAdminFamily = cache(async (id: string) =>
  FamilySlugSchema.safeParse(id).success
    ? load<AdminFamily>(`/api/v1/admin/synths/families/${encodeURIComponent(id)}`)
    : ('missing' as const)
);

/** The synths and instruments the form offers, or null when either could not be loaded. */
export const getFamilyFormOptions = cache(async (): Promise<FamilyFormOptions | null> => {
  const [synths, instruments] = await Promise.all([
    load<AdminSynth[]>('/api/v1/admin/synths'),
    load<AdminBankRow[]>('/api/v1/admin/bank/instruments'),
  ]);
  const s = listOrNull(synths);
  const i = listOrNull(instruments);
  if (!s || !i) return null;
  return {
    synths: s.map((x) => ({ id: x.id, name: `${x.maker} ${x.name}` })),
    instruments: i.map((x) => ({ id: x.id, name: x.name, detail: x.detail })),
  };
});
