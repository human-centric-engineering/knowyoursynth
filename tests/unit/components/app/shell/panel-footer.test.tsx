// @vitest-environment happy-dom

/**
 * PanelFooter: the synth page's slim footer.
 *
 * What it must never lose is the Cookie Preferences control: a fork that
 * supplies its own footer frame has to render a real one (`lib/app/footer.ts`).
 * The legal links and the attribution line come through the same seams as the
 * platform footers, so an override reaches this footer too.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

const openPreferences = vi.fn();

vi.mock('@/lib/consent', () => ({
  useConsent: () => ({ openPreferences }),
}));

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('@/lib/app/public-nav');
  vi.doUnmock('@/lib/app/footer');
  openPreferences.mockClear();
});

async function renderFooter() {
  const { PanelFooter } = await import('@/components/app/shell/panel-footer');
  render(React.createElement(PanelFooter));
}

describe('PanelFooter', () => {
  it('renders the legal links and the attribution line', async () => {
    await renderFooter();

    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy'
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms'
    );
    // tests/setup.ts pins the brand seam to "unconfigured", so read the name it resolves to.
    const { BRAND } = await import('@/lib/brand');
    expect(
      screen.getByText(`© ${new Date().getFullYear()} ${BRAND.legalName}`)
    ).toBeInTheDocument();
  });

  it('opens the consent preferences from Cookie Preferences', async () => {
    await renderFooter();

    await userEvent.click(screen.getByRole('button', { name: 'Cookie Preferences' }));

    expect(openPreferences).toHaveBeenCalledTimes(1);
  });

  it('follows a legal-links override and keeps Cookie Preferences', async () => {
    vi.doMock('@/lib/app/public-nav', () => ({
      publicNavItems: null,
      footerNavItems: null,
      footerLegalItems: [{ href: '/legal', label: 'Legal' }],
    }));
    await renderFooter();

    expect(screen.getByRole('link', { name: 'Legal' })).toHaveAttribute('href', '/legal');
    expect(screen.queryByRole('link', { name: 'Privacy Policy' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cookie Preferences' })).toBeInTheDocument();
  });

  it('drops the attribution line when the footer seam is false, and keeps Cookie Preferences', async () => {
    vi.doMock('@/lib/app/footer', () => ({ footerCopyright: false }));
    await renderFooter();

    expect(screen.queryByText(/©/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Cookie Preferences' })).toBeInTheDocument();
  });
});
