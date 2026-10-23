/**
 * App admin-sidebar nav registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: `components/admin/admin-sidebar.tsx` calls this once at module
 * load (client runtime). Add `registerNavSection({ … })` calls. Keep this file
 * client-safe — registrar + icon imports only, no server code — and use a
 * `title` distinct from the core sections.
 *
 * Know Your Synth fills it with one "Synths" section, for the pages that look after the content: Designs
 * (`f-panel-designs`), the catalogue editor and the data page (`f-catalogue-admin`), the databank and its suggestion queue (`f-databank`), and reported sounds (`f-sharing`). Designs lives at the section's root, so it is
 * `exact`: otherwise it would also light up on every catalogue page beneath it.
 *
 * Full guide + example: CUSTOMIZATION.md §4 · lib/admin-nav/registry.ts
 */
import { BookUser, DatabaseZap, Flag, Inbox, Library, Palette } from 'lucide-react';

import { registerNavSection } from '@/lib/admin-nav/registry';

export function initAppNav(): void {
  registerNavSection({
    title: 'Synths',
    items: [
      {
        href: '/admin/synths',
        label: 'Designs',
        icon: Palette,
        description: "Each synth's panel design, and the maker's approval to show their marks",
        exact: true,
      },
      {
        href: '/admin/synths/catalogue',
        label: 'Catalogue',
        icon: Library,
        description:
          'Order and list the synths, and edit their patches, lessons, lineage and notes',
      },
      {
        href: '/admin/synths/bank',
        label: 'Databank',
        icon: BookUser,
        description: 'Create, edit and remove the artists, innovators, records and instruments',
      },
      {
        href: '/admin/synths/suggestions',
        label: 'Suggestions',
        icon: Inbox,
        description: 'Synths users say are missing: accept, merge or decline each',
      },
      {
        href: '/admin/synths/reports',
        label: 'Reported patches',
        icon: Flag,
        description: 'Shared patches people reported: unlist, restore or dismiss each',
      },
      {
        href: '/admin/synths/data',
        label: 'Data',
        icon: DatabaseZap,
        description: 'Where the content comes from, what still matches the seed, and a template',
      },
    ],
  });
}
