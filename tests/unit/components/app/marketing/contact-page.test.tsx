// @vitest-environment happy-dom

/**
 * `/contact` (`f-front-door` t-63): the app's copy around Sunrise's own contact form, which is stubbed here; the form
 * has its own tests. The route file is a shim, so it is imported here to prove it serves this module.
 *
 * @see components/app/marketing/contact-page.tsx
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/forms/contact-form', () => ({
  ContactForm: () => <form aria-label="Contact form" />,
}));

import ContactRoute, { metadata as routeMetadata } from '@/app/(public)/contact/page';
import ContactPage, { metadata } from '@/components/app/marketing/contact-page';

describe('contact page', () => {
  it('is what the route file serves, metadata and all', () => {
    expect(ContactRoute).toBe(ContactPage);
    expect(routeMetadata).toBe(metadata);
  });

  it('has its title and description', () => {
    expect(metadata.title).toBe('Contact');
    expect(metadata.description).toBe(
      'Report a mistake, ask for a synth, or tell us something. We read everything.'
    );
    expect(metadata.twitter).toMatchObject({ title: 'Contact - Sunrise' });
  });

  it("renders its heading around Sunrise's contact form", () => {
    render(<ContactPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Get in touch' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Contact form' })).toBeInTheDocument();
    expect(screen.getByText('Send a message')).toBeInTheDocument();
  });

  it('has the email and rights-holder notes, and no promises it has not made', () => {
    render(<ContactPage />);
    expect(screen.getByRole('heading', { name: 'Makers and rights holders' })).toBeInTheDocument();
    expect(screen.getByText('[OWNER: the contact address]')).toBeInTheDocument();
    expect(screen.queryByText(/response time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/github/i)).not.toBeInTheDocument();
  });
});
