/**
 * The databank admin's URLs and names (`f-databank` t-36), under the Synths admin section. Shared by the server pages
 * and the client components, so it holds no component.
 */
// Type only: this module reaches the browser, and the read layer holds the database client.
import type { BankKind } from '@/lib/app/bank/read';

export const BANK_ADMIN_ROOT = '/admin/synths/bank';

/** The synth suggestion queue (`f-databank` t-37). */
export const BANK_SUGGESTIONS_PATH = `${BANK_ADMIN_ROOT}/suggestions`;

/** A kind's list, a row's editor, or the form for a new row (`id` of `'new'`). */
export function bankAdminPath(kind: BankKind, id?: string): string {
  return id ? `${BANK_ADMIN_ROOT}/${kind}/${id}` : `${BANK_ADMIN_ROOT}?kind=${kind}`;
}

/** One row of a kind, as a sentence names it: the public tabs' labels in the singular. */
export const BANK_SINGULAR: Record<BankKind, string> = {
  artists: 'artist',
  makers: 'innovator',
  songs: 'record',
  instruments: 'instrument',
};
