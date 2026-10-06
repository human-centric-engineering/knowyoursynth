'use client';

import Link from 'next/link';

import { footerLegalItems } from '@/lib/app/public-nav';
import { BRAND } from '@/lib/brand';
import { useConsent } from '@/lib/consent';
import { resolveFooterCopyright } from '@/lib/footer/copyright';
import { DEFAULT_FOOTER_LEGAL } from '@/lib/public-nav/types';

const legalLinks = footerLegalItems ?? DEFAULT_FOOTER_LEGAL;

/**
 * The synth page's footer: one slim full-width line under the panel.
 *
 * It keeps what a footer owes every page: the legal links, the attribution
 * line, and **Cookie Preferences**. The platform's footers render that control
 * themselves, and a fork that supplies its own footer frame has to render a
 * real one too (`lib/app/footer.ts`). The site's link cluster is left to the
 * marketing footer, so the panel keeps its height.
 */
export function PanelFooter() {
  const { openPreferences } = useConsent();
  const copyright = resolveFooterCopyright(new Date().getFullYear(), BRAND.legalName);

  return (
    <footer className="border-t">
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 text-xs">
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {legalLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={openPreferences}
            className="hover:text-foreground transition-colors"
          >
            Cookie Preferences
          </button>
        </nav>
        {copyright && <p>{copyright}</p>}
      </div>
    </footer>
  );
}
