import '@/components/app/marketing/faces';

import type { Metadata } from 'next';

import { OwnerField } from '@/components/app/legal/owner-field';
import { ContactForm } from '@/components/forms/contact-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BRAND } from '@/lib/brand';

/**
 * `/contact` (`f-front-door` t-63, `.context/app/planning/site-copy.md` §3). Only the copy is the app's: the form is
 * Sunrise's `<ContactForm>`, unchanged, posting to `/api/v1/contact` with its validation, honeypot, rate limit and
 * admin notification. The route file is a one-line shim re-exporting this module (CUSTOMIZATION.md §6).
 *
 * No response-time promise and no GitHub card: neither is a commitment the app has made.
 */

const description = 'Report a mistake, ask for a synth, or tell us something. We read everything.';

export const metadata: Metadata = {
  title: 'Contact',
  description,
  openGraph: { title: `Contact - ${BRAND.name}`, description },
  twitter: { card: 'summary_large_image', title: `Contact - ${BRAND.name}`, description },
};

export default function ContactPage() {
  return (
    <div className="kys-frame mx-auto w-full max-w-[1040px] px-4 py-12 text-(--kys-text) sm:px-6 md:py-16">
      <header className="max-w-[42rem]">
        <p className="kys-label text-(--kys-accent)">Contact</p>
        <h1 className="kys-display mt-1 text-[28px] leading-tight sm:text-[32px]">Get in touch</h1>
        <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-(--kys-muted)">
          <p>
            Found a control that doesn&apos;t do what it does on the hardware, a wrong fact in the
            databank, or a lesson that loses you halfway? Want a synth added? Tell us here. We read
            everything, though we can&apos;t always reply.
          </p>
          <p>
            To report a published patch, use <strong className="text-(--kys-text)">Report</strong>{' '}
            on its page. It reaches us faster.
          </p>
        </div>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Send a message</CardTitle>
              <CardDescription>Say which synth or page, if it&apos;s about one.</CardDescription>
            </CardHeader>
            <CardContent>
              <ContactForm />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-8 lg:col-span-2">
          <section>
            <h2 className="kys-label text-(--kys-muted)">Email</h2>
            <p className="mt-2 text-[15px]">
              <OwnerField>the contact address</OwnerField>
            </p>
          </section>
          <section>
            <h2 className="kys-label text-(--kys-muted)">Makers and rights holders</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-(--kys-muted)">
              If you make or own the rights to an instrument the app models, write to us here and
              say which. We will look at it promptly.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
