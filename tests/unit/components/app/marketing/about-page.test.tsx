// @vitest-environment happy-dom

/**
 * `/about` (`f-front-door` t-63): its heading and metadata, the not-affiliated notice in full, and the owner's
 * unfilled facts showing as such. The route file is a shim, so it is imported here to prove it serves this module.
 *
 * @see components/app/marketing/about-page.tsx
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import AboutRoute, { metadata as routeMetadata } from '@/app/(public)/about/page';
import AboutPage, { metadata } from '@/components/app/marketing/about-page';

describe('about page', () => {
  it('is what the route file serves, metadata and all', () => {
    expect(AboutRoute).toBe(AboutPage);
    expect(routeMetadata).toBe(metadata);
  });

  it('has its title and description', () => {
    expect(metadata.title).toBe('About');
    expect(metadata.description).toMatch(/not affiliated with any synth maker\.$/);
    expect(metadata.openGraph?.title).toBe('About - Sunrise');
  });

  it('renders its heading and sections', () => {
    render(<AboutPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'About Sunrise' })).toBeInTheDocument();
    for (const name of [
      'How the panels are made',
      'Two ways a panel can look',
      'The tutor',
      'The databank',
      'Not affiliated with any synth maker',
      'Who makes it',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('carries the notice in full, naming the makers', () => {
    render(<AboutPage />);
    expect(screen.getByText(/is not made, endorsed, sponsored or approved/)).toHaveTextContent(
      'including ARP, Behringer, Buchla, EMS, Korg, Moog, Oberheim, Roland and Sequential'
    );
    expect(screen.getByText(/are trademarks of their owners/)).toBeInTheDocument();
  });

  it('shows the origin story as the owner’s to write', () => {
    render(<AboutPage />);
    expect(screen.getByText(/^\[OWNER: the origin story/)).toBeInTheDocument();
  });

  it('links the privacy policy from the tutor section', () => {
    render(<AboutPage />);
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute(
      'href',
      '/privacy'
    );
  });
});
