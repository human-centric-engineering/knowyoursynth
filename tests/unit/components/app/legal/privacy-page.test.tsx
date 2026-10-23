// @vitest-environment happy-dom

/**
 * `/privacy` (`f-front-door` t-64). Three kinds of check. Nothing of Sunrise's placeholder is left outside the
 * `[OWNER: …]` fields the f-launch review fills in. Every part of the account export is named, read from the same
 * manifests the export is built from, so a source the page filtered out fails here. And the facts a reader relies on
 * are stated: what the tutor sends and to whom, what is public, and how to download and delete.
 *
 * @see components/app/legal/privacy-page.tsx
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import PrivacyRoute, { metadata as routeMetadata } from '@/app/(public)/privacy/page';
import PrivacyPolicyPage, { metadata } from '@/components/app/legal/privacy-page';
import { attributionSources, exportedSources } from '@/lib/privacy/export-sources';
import { getAppSubjectSources } from '@/lib/privacy/subject-source-registry';

const OWNER = /\[OWNER: [^\]]+\]/g;

/** The page's text with the owner's unfilled fields taken out, so a check can't pass on a marker's wording. */
function pageText(): string {
  render(<PrivacyPolicyPage />);
  return (document.body.textContent ?? '').replace(OWNER, '').replace(/\s+/g, ' ');
}

function ownerFields(): string[] {
  return Array.from(document.querySelectorAll('mark'), (m) => m.textContent ?? '');
}

function list(testId: string) {
  const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`no ${testId}`);
  return within(el);
}

describe('privacy page', () => {
  it('is what the route file serves, metadata and all', () => {
    expect(PrivacyRoute).toBe(PrivacyPolicyPage);
    expect(routeMetadata).toBe(metadata);
    expect(metadata.title).toBe('Privacy Policy');
    expect(metadata.openGraph?.title).toBe('Privacy Policy - Sunrise');
  });

  it('renders its heading and sections', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument();
    for (const name of [
      'Who we are',
      'The short version',
      'What we keep, and why',
      'What is public',
      'The tutor',
      'Cookies, your browser and analytics',
      'Who else handles it',
      'How long we keep it',
      'Your rights',
      'Everything in your download',
      'Changes to this policy',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('has nothing of the placeholder left outside the owner’s fields', () => {
    const text = pageText();
    expect(text).not.toMatch(/placeholder/i);
    expect(text.toLowerCase()).not.toContain('example.com');
    expect(text).not.toMatch(/Replace (this|with)/i);
    expect(text).not.toMatch(/January 19, 2026/);
  });

  it('marks the facts only the owner has', () => {
    render(<PrivacyPolicyPage />);
    const fields = ownerFields();
    expect(fields.every((f) => /^\[OWNER: .+\]$/.test(f))).toBe(true);
    const all = fields.join(' ');
    for (const fact of [
      'legal entity',
      'minimum age',
      'privacy contact email',
      'hosting region',
      "the tutor's AI provider",
    ]) {
      expect(all).toContain(fact);
    }
  });
});

describe('every part of the export is named', () => {
  it('lists each of the app’s sections with its description', () => {
    render(<PrivacyPolicyPage />);
    const sources = getAppSubjectSources().filter((source) => source.disposition === 'export');
    expect(sources.length).toBeGreaterThan(5);
    const app = list('sources-app');
    for (const source of sources) {
      expect(app.getByText(source.section).parentElement?.textContent).toContain(
        source.description
      );
    }
  });

  it('lists each exported platform section with its description, and each attribution by name', () => {
    render(<PrivacyPolicyPage />);
    const exported = exportedSources();
    expect(exported.length).toBeGreaterThan(5);
    const platform = list('sources-platform');
    for (const source of exported) {
      expect(platform.getByText(source.section).parentElement?.textContent).toContain(
        source.description
      );
    }
    const attribution = list('sources-attribution');
    for (const source of attributionSources()) {
      expect(attribution.getByText(source.section)).toBeInTheDocument();
    }
  });
});

describe('what a reader relies on', () => {
  it('says what the tutor sends, and that it does not send who you are', () => {
    const text = pageText();
    expect(text).toMatch(/your message, the synth you are on, the panel as you have it/);
    expect(text).toMatch(/We do not send your name, your email address or your username/);
  });

  it('names Brave for the tutor’s web searches, and sends them from the server', () => {
    expect(pageText()).toMatch(
      /sent to Brave's Search API, from our server rather than your browser/
    );
  });

  it('names Resend for email', () => {
    expect(pageText()).toMatch(/Resend sends account emails/);
  });

  it('says anything public is under the username, never the account name or email', () => {
    expect(pageText()).toMatch(/never under your account name or email address/);
  });

  it('says link shares are unlisted and hidden from search engines, and a profile is born private', () => {
    const text = pageText();
    expect(text).toMatch(/It is not listed anywhere and is hidden from search engines/);
    expect(text).toMatch(/Your profile page is private until you switch it on/);
  });

  it('names the browser storage and the cookie choice', () => {
    const text = pageText();
    expect(text).toMatch(/A cookie keeps you signed in/);
    expect(text).toMatch(/each synth's panel as you left it/);
  });

  it('links the download and says where delete is, and what deletion leaves', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('link', { name: 'download your data' })).toHaveAttribute(
      'href',
      '/api/v1/users/me/export'
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    const text = (document.body.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toMatch(/deletes your account and what is in it, published patches included/);
    expect(text).toMatch(/kept but no longer say who they came from/);
  });
});
