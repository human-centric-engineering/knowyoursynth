import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, LegalSection, legalLink } from '@/components/app/legal/legal-page';
import { OwnerField } from '@/components/app/legal/owner-field';
import { BRAND } from '@/lib/brand';

/**
 * `/terms` (`f-front-door` t-64). The structure is BeatBreaker's (`~/code/beatbreaker/components/app/legal/terms.tsx`);
 * what it says about sharing, copies and moderation is this app's (`.context/app/sharing.md`), and what it says about
 * the panels repeats the not-affiliated notice on About (`components/app/marketing/about-page.tsx`, D11). The route
 * file is a one-line shim re-exporting this module (CUSTOMIZATION.md §6).
 *
 * Facts only the owner has are `<OwnerField>`s. The liability and governing-law wording is for the f-launch legal
 * review: it is the part a template cannot be trusted with.
 */

export const TERMS_UPDATED = '19 October 2026';

const description = `The terms for using ${BRAND.name}: your account, the sounds you make and share, the tutor, and what we may do when a rule is broken.`;

export const metadata: Metadata = {
  title: 'Terms of Service',
  description,
  openGraph: { title: `Terms of Service - ${BRAND.name}`, description },
  twitter: { card: 'summary', title: `Terms of Service - ${BRAND.name}`, description },
};

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of service" updated={TERMS_UPDATED}>
      <LegalSection title="Who these are with">
        <p>
          These terms are between you and{' '}
          <OwnerField>legal entity name and registered address</OwnerField>, which runs {BRAND.name}
          . By making an account you agree to them. You must be at least{' '}
          <OwnerField>minimum age</OwnerField> to make one. Our{' '}
          <Link href="/privacy" className={legalLink}>
            privacy policy
          </Link>{' '}
          says what we keep and why.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          Keep your password to yourself: you are responsible for what is done with your account.
          You can delete it at any time from Settings, and everything in it goes with it.
        </p>
      </LegalSection>

      <LegalSection title="The panels">
        <p>
          The panels are models made for learning. They are not the instruments, and they are not
          sold as substitutes for them. {BRAND.name} is independent, and not made, endorsed or
          approved by any company whose instruments it models or lists.{' '}
          <Link href="/about" className={legalLink}>
            About
          </Link>{' '}
          says what the panels model and what they don&apos;t.
        </p>
        <p>
          Product, model and maker names are trademarks of their owners, used only to say which
          instrument a panel models or a record was played on.
        </p>
      </LegalSection>

      <LegalSection title="Sounds you make">
        <p>
          A sound you make is yours. Keeping it private gives nobody any rights in it. Sharing it
          with a link lets anyone with the link play it and, signed in, save a copy of their own to
          learn from.
        </p>
        <p>
          When you publish one, you let everyone who uses {BRAND.name} play it, save a copy, change
          it and publish what they make from it, as long as it keeps the credit to you that{' '}
          {BRAND.name} shows. You can unpublish it whenever you like. That stops new copies, and
          copies people have already saved stay with them.
        </p>
        <p>A sound the tutor designed for you is yours in the same way, lesson included.</p>
      </LegalSection>

      <LegalSection title="What you may not do">
        <ul>
          <li>
            Publish someone else&apos;s sound as your own. A copy has to be changed before it can be
            published, and it keeps the credit to the sound it came from.
          </li>
          <li>
            Use a sound&apos;s name, notes or lesson, or a username, to abuse or harass anyone, or
            for anything offensive.
          </li>
          <li>
            Add profile links that are not yours. Each one should point to your own YouTube,
            Spotify, Instagram or Bandcamp.
          </li>
          <li>Spam Explore, or flood {BRAND.name} or the tutor with requests.</li>
          <li>Try to get into accounts or parts of {BRAND.name} that are not yours.</li>
        </ul>
        <p>
          We may unlist a shared sound that breaks these rules, which takes it off every page and
          stops its link working for anyone but you, and we may close an account that keeps breaking
          them. Anyone can report a shared sound they think breaks them, and a moderator looks at
          every report.
        </p>
      </LegalSection>

      <LegalSection title="The tutor and the databank">
        <p>
          The tutor has a daily allowance of questions, so it stays available to everyone. It
          suggests changes to the panel and you choose whether to apply each one. It can be wrong,
          so check what it tells you, especially about people and records.
        </p>
        <p>
          The databank is compiled from facts. If something in it is wrong,{' '}
          <Link href="/contact" className={legalLink}>
            tell us
          </Link>{' '}
          and we will fix it.
        </p>
      </LegalSection>

      <LegalSection title="The service">
        <p>
          {BRAND.name} is provided as it is. We work to keep it running and your sounds safe, but we
          cannot promise it will always be available or free of errors, and we may change or stop
          parts of it. Download your data from the{' '}
          <Link href="/privacy" className={legalLink}>
            privacy policy
          </Link>{' '}
          if you want a copy of your own.
        </p>
        <p>
          <OwnerField>
            limitation of liability, and the consumer rights it does not affect, worded for the
            governing law
          </OwnerField>
        </p>
      </LegalSection>

      <LegalSection title="Changes and the law">
        <p>
          When we change these terms we will update the date at the top, and tell you by email
          before a change that affects your rights takes effect. These terms are governed by the law
          of <OwnerField>governing law and courts</OwnerField>.
        </p>
        <p>
          Questions about these terms: <OwnerField>contact email</OwnerField>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
