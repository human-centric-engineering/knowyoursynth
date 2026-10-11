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
 * Know Your Synth fills it with one "Synths" section, for the pages that look after the catalogue. Designs is the first
 * (`f-panel-designs`); the catalogue editor (`f-catalogue-admin`) joins the same section rather than adding its own.
 *
 * Full guide + example: CUSTOMIZATION.md §4 · lib/admin-nav/registry.ts
 */
import { Palette } from 'lucide-react';

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
      },
    ],
  });
}
