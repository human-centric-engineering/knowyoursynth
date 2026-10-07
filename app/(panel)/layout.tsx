import type { Metadata } from 'next';

import '@fontsource/archivo-narrow/latin-500.css';
import '@fontsource/archivo-narrow/latin-700.css';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/instrument-sans/latin-400.css';
import '@fontsource/instrument-sans/latin-500.css';
import '@fontsource/instrument-sans/latin-600.css';
import '@fontsource/instrument-sans/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import '@fontsource/michroma/latin-400.css';
import '@/components/app/shell/panel-frame.css';

import { PanelFooter } from '@/components/app/shell/panel-footer';
import { PanelHeader } from '@/components/app/shell/panel-header';
import { MaintenanceWrapper } from '@/components/maintenance-wrapper';
import { BRAND } from '@/lib/brand';

/**
 * The synth page's own frame.
 *
 * A route group of its own because a synth panel is a full-window instrument,
 * not a page in the site's centred column: `(public)` and `(protected)` wrap
 * their pages in `container mx-auto`, and a nested layout cannot escape its
 * parent. The header and footer here run the full width instead.
 *
 * Public, like `(public)`: anyone can open a synth without an account (plan §4),
 * so nothing here is in `protected-routes.ts`. Maintenance mode still applies.
 *
 * The prototype's five faces come from Fontsource rather than `next/font`.
 * `next/font` renames each family to a hash (`'__Michroma_1a2b3c'`), and the
 * ported panel names its faces literally (`'Michroma'`, `'Barlow Semi
 * Condensed'`) in SVG attributes, as the prototype did. Fontsource declares
 * the real family names, self-hosted from the bundle, so those attributes
 * resolve, with no third-party request and no CSP change. Once this layout's
 * CSS is on the page the faces are document-wide, so body-portaled dialogs
 * get them too. Latin subset only: every label and name in the 25 synths is
 * Latin-1.
 */

export const metadata: Metadata = {
  title: {
    template: `%s - ${BRAND.name}`,
    default: BRAND.name,
  },
  description: BRAND.description,
};

export default function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <MaintenanceWrapper>
      <div className="kys-frame bg-background text-foreground flex min-h-screen flex-col">
        <PanelHeader />
        <main className="flex flex-1 flex-col">{children}</main>
        <PanelFooter />
      </div>
    </MaintenanceWrapper>
  );
}
