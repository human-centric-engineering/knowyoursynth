import Link from 'next/link';

import { BrandMark } from '@/components/brand/brand-mark';
import { HeaderActions } from '@/components/layouts/header-actions';
import { PublicNav } from '@/components/layouts/public-nav';

/**
 * The synth page's header: wordmark, navigation, theme and user menu.
 *
 * Sunrise's `AppHeader` with the container taken off, so it spans the window
 * like the panel under it. The navigation is the platform's `PublicNav`, so
 * links added through `lib/app/public-nav.ts` reach this header and the
 * marketing pages alike.
 */
export function PanelHeader() {
  return (
    <header className="border-b">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-6">
          <Link href="/" className="kys-wordmark shrink-0 hover:opacity-80">
            <BrandMark />
          </Link>
          <PublicNav />
        </div>
        <HeaderActions />
      </div>
    </header>
  );
}
