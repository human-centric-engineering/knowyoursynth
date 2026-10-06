// @vitest-environment happy-dom

/**
 * PanelHeader: the synth page's full-width header.
 *
 * It is assembled from platform parts (BrandMark, PublicNav, HeaderActions), so
 * what is worth pinning is the assembly: the wordmark links home, and the
 * navigation is the one `lib/app/public-nav.ts` governs, not a second list.
 * HeaderActions is stubbed; its theme toggle and user menu have their own tests.
 *
 * `usePathname` is globally mocked to '/' (tests/setup.ts).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import * as React from 'react';

vi.mock('@/components/layouts/header-actions', () => ({
  HeaderActions: () => React.createElement('div', { 'data-testid': 'header-actions' }),
}));

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/app/public-nav');
});

async function renderHeader() {
  const { PanelHeader } = await import('@/components/app/shell/panel-header');
  render(React.createElement(PanelHeader));
}

describe('PanelHeader', () => {
  it('links the wordmark home', async () => {
    await renderHeader();

    // tests/setup.ts pins the brand seam to "unconfigured", so read the name it resolves to.
    const { BRAND } = await import('@/lib/brand');
    expect(screen.getByRole('link', { name: BRAND.name })).toHaveAttribute('href', '/');
  });

  it('shows the theme and user actions', async () => {
    await renderHeader();

    expect(screen.getByTestId('header-actions')).toBeInTheDocument();
  });

  it('takes its navigation from the public-nav seam', async () => {
    vi.doMock('@/lib/app/public-nav', () => ({
      publicNavItems: [{ href: '/synths', label: 'Synths' }],
      footerNavItems: null,
      footerLegalItems: null,
    }));
    await renderHeader();

    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: 'Synths' })).toHaveAttribute('href', '/synths');
    expect(within(nav).queryByRole('link', { name: 'About' })).toBeNull();
  });
});
