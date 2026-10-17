/**
 * App public marketing nav overrides.
 *
 * **Fork-owned scaffold** — Sunrise ships every list `null` (= use the platform
 * default) and does NOT change this file after release, so your edits here merge
 * cleanly on upgrade (the stable contract is this file's exports, not their
 * values). Treat it like the landing page: a starting point you're expected to
 * modify.
 *
 * Forks OWN these lists, so the model is *replacement*, not append: set a list
 * to a non-null `PublicNavItem[]` and it **replaces** the platform default
 * wholesale (remove/rename/reorder freely). Leave it `null` to keep the default.
 *
 * Auto-wired: `components/layouts/public-nav.tsx` reads `publicNavItems`;
 * `public-footer.tsx` reads `footerNavItems` and `footerLegalItems`. The
 * `next/link` / active-state glue stays in those platform components.
 *
 * Not overridable: the footer's **Cookie Preferences** control is always
 * rendered by the platform regardless of `footerLegalItems` — this seam governs
 * *links*, not the consent control (a legal requirement in many jurisdictions).
 *
 * Boundary-clean: type-only import, so this stays within the `lib/app/**`
 * framework-agnostic boundary.
 *
 * Full guide: CUSTOMIZATION.md §4 · lib/public-nav/types.ts
 */
import { Compass, Home, Info, Mail } from 'lucide-react';

import type { PublicNavItem } from '@/lib/public-nav/types';

/** Header nav. `null` = platform default; a non-null array replaces it. */
// Know Your Synth: the platform's three links with Explore (`f-sharing` h2) after Home. Retyped rather than spread
// from `DEFAULT_PUBLIC_NAV`, as `protected-nav.ts` is, because it goes in the middle. The footers keep the default.
export const publicNavItems: PublicNavItem[] | null = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/explore', label: 'Explore', icon: Compass },
  { href: '/about', label: 'About', icon: Info },
  { href: '/contact', label: 'Contact', icon: Mail },
];

/** Footer link cluster. `null` = platform default; a non-null array replaces it. */
export const footerNavItems: PublicNavItem[] | null = null;

/** Footer legal cluster. `null` = platform default; a non-null array replaces it.
 * The Cookie Preferences control renders regardless. */
export const footerLegalItems: PublicNavItem[] | null = null;
