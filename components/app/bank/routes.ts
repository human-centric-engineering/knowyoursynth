/**
 * The databank's URLs, and the prototype's `#bank/<tab>/<id>` links.
 *
 * Plan §4 "Pages and routes": the databank is `/bank` and `/bank/[tab]/[id]`. A tab's segment is the kind the API
 * serves (`GET /api/v1/bank/[kind]`) and the prototype's hash used, so an old link maps straight across. `/bank` is the
 * artists tab, as the prototype's databank opened on it.
 */

// Type only: this module reaches the browser, and the read layer holds the database client.
import type { BankKind } from '@/lib/app/bank/read';

/** The tabs, in the prototype's order, with their labels (`Bank.jsx`). */
export const BANK_TABS: readonly (readonly [BankKind, string])[] = [
  ['artists', 'Artists'],
  ['makers', 'Innovators'],
  ['songs', 'Records'],
  ['instruments', 'Instruments'],
];

/** The tab `/bank` shows. */
export const DEFAULT_TAB: BankKind = 'artists';

export const isBankTab = (tab: string): tab is BankKind => BANK_TABS.some(([t]) => t === tab);

export const tabLabel = (tab: BankKind): string => BANK_TABS.find(([t]) => t === tab)?.[1] ?? tab;

/** A tab's list, or one row's page. The default tab's list is `/bank` itself. Ids are slugs, so they go in as they are. */
export function bankHref(tab: BankKind = DEFAULT_TAB, id?: string): string {
  if (id) return `/bank/${tab}/${id}`;
  return tab === DEFAULT_TAB ? '/bank' : `/bank/${tab}`;
}

/**
 * A prototype `#bank/<tab>/<id>` link → the page it now lives at, or `null` when the hash is not a databank link. As
 * the prototype did, a tab it does not know opens the artists tab, and the id is dropped with it. Whether the row
 * exists is the page's to say (a 404).
 */
export function bankHashRoute(hash: string): string | null {
  const [head, tab = '', id = ''] = hash.replace(/^#/, '').split('/');
  if (head !== 'bank') return null;
  if (!isBankTab(tab)) return bankHref();
  return bankHref(tab, /^[a-z0-9-]+$/.test(id) ? id : undefined);
}
