'use client';

import { NO_FLASH_THEME_SCRIPT } from '@/lib/theme';

/**
 * The root layout's no-flash theme script.
 *
 * It runs once, from the server HTML, before first paint. When React later
 * builds the root on the client (recovering from an error, or after a root
 * re-render) it creates a fresh `<script>` that never runs, and React 19 warns
 * "Encountered a script tag while rendering React component". Giving the
 * client copy a non-JavaScript `type` makes it an inert data block, so React
 * does not warn. The server copy keeps no `type` and runs as before.
 * `suppressHydrationWarning` covers the `type` difference and the browser
 * hiding `nonce` after load.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  return (
    <script
      nonce={nonce}
      type={typeof window === 'undefined' ? undefined : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }}
    />
  );
}
