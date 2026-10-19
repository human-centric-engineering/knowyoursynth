// @vitest-environment happy-dom

/**
 * `/terms` (`f-front-door` t-64): served by the route file, nothing of Sunrise's placeholder left outside the
 * `[OWNER: …]` fields, and the rules a reader relies on stated: what publishing lets others do, that a copy keeps its
 * credit, and what moderators may do.
 *
 * @see components/app/legal/terms-page.tsx
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import TermsRoute, { metadata as routeMetadata } from '@/app/(public)/terms/page';
import TermsOfServicePage, { metadata } from '@/components/app/legal/terms-page';

function pageText(): string {
  render(<TermsOfServicePage />);
  return (document.body.textContent ?? '').replace(/\[OWNER: [^\]]+\]/g, '').replace(/\s+/g, ' ');
}

describe('terms page', () => {
  it('is what the route file serves, metadata and all', () => {
    expect(TermsRoute).toBe(TermsOfServicePage);
    expect(routeMetadata).toBe(metadata);
    expect(metadata.title).toBe('Terms of Service');
    expect(metadata.openGraph?.title).toBe('Terms of Service - Sunrise');
  });

  it('renders its heading and sections', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeInTheDocument();
    for (const name of [
      'Who these are with',
      'Your account',
      'The panels',
      'Sounds you make',
      'What you may not do',
      'The tutor and the databank',
      'The service',
      'Changes and the law',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('has nothing of the placeholder left outside the owner’s fields', () => {
    const text = pageText();
    expect(text).not.toMatch(/placeholder/i);
    expect(text.toLowerCase()).not.toContain('example.com');
    expect(text).not.toMatch(/MIT license/);
    expect(text).not.toMatch(/January 19, 2026/);
  });

  it('marks the facts only the owner has', () => {
    render(<TermsOfServicePage />);
    const all = Array.from(document.querySelectorAll('mark'), (m) => m.textContent).join(' ');
    for (const fact of [
      'legal entity',
      'minimum age',
      'limitation of liability',
      'governing law',
    ]) {
      expect(all).toContain(fact);
    }
  });

  it('says what publishing lets others do, and that copies keep the credit', () => {
    const text = pageText();
    expect(text).toMatch(/save a copy, change it and publish what they make from it/);
    expect(text).toMatch(/A copy has to be changed before it can be published/);
  });

  it('says the panels are models and the app is not affiliated', () => {
    const text = pageText();
    expect(text).toMatch(/The panels are models made for learning/);
    expect(text).toMatch(/not made, endorsed or approved by any company/);
  });

  it('says what moderators may do', () => {
    expect(pageText()).toMatch(/We may unlist a shared sound that breaks these rules/);
  });

  it('links the privacy policy', () => {
    render(<TermsOfServicePage />);
    expect(screen.getAllByRole('link', { name: 'privacy policy' })[0]).toHaveAttribute(
      'href',
      '/privacy'
    );
  });
});
