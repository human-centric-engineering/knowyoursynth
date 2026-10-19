import type { Metadata } from 'next';
import Link from 'next/link';

import { LegalPage, LegalSection, legalLink } from '@/components/app/legal/legal-page';
import { OwnerField } from '@/components/app/legal/owner-field';
import { BRAND } from '@/lib/brand';
import { attributionSources, exportedSources } from '@/lib/privacy/export-sources';
import { getAppSubjectSources } from '@/lib/privacy/subject-source-registry';

/**
 * `/privacy` (`f-front-door` t-64), written from what the app stores and sends rather than from a template. The
 * structure is BeatBreaker's (`~/code/beatbreaker/components/app/legal/`); the facts are this codebase's. The route file
 * is a one-line shim re-exporting this module (CUSTOMIZATION.md §6).
 *
 * **What is kept is not written out by hand** under "Everything in your download": it is rendered from the manifests
 * the account export is built from, Sunrise's `SUBJECT_DATA_SOURCES` and the app's declared sources
 * (`lib/app/data-export.ts`), each with its own description. A table added to the export appears here with nothing else
 * to remember, and the page test fails if one is filtered out. The prose sections above it are by hand, and say what
 * each kind of data is for.
 *
 * **Who else handles it** is read from the code: the tutor's provider is whichever the admin configures (the agent has
 * none of its own, `lib/app/tutor/agent.ts`); Brave receives `web_search`'s query (`lib/app/tutor/web-search.ts`); the
 * embedding provider receives `search_databank`'s query when the meaning layer is set up (`lib/app/bank/knowledge.ts`,
 * OpenAI in `.context/app/tutor.md`'s setup); Resend sends email (`lib/email/client.ts`). Google sign-in, Sentry and
 * analytics are the platform's and switch on only when configured, so each says so and leaves the fact to the owner.
 *
 * Facts only the owner has are `<OwnerField>`s; the f-launch legal review fills them in.
 */

export const PRIVACY_UPDATED = '19 October 2026';

const description = `What ${BRAND.name} keeps about you, what is public, who else handles it, and how to download or delete it.`;

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description,
  openGraph: { title: `Privacy Policy - ${BRAND.name}`, description },
  twitter: { card: 'summary', title: `Privacy Policy - ${BRAND.name}`, description },
};

export default function PrivacyPolicyPage() {
  const app = getAppSubjectSources();
  const platform = exportedSources();
  const attribution = attributionSources();

  return (
    <LegalPage title="Privacy policy" updated={PRIVACY_UPDATED}>
      <LegalSection title="Who we are">
        <p>
          {BRAND.name} is run by <OwnerField>legal entity name and registered address</OwnerField>,
          which is the controller of your personal data. For anything about this policy or your
          data, write to <OwnerField>privacy contact email</OwnerField>.
        </p>
        <p>
          You must be at least <OwnerField>minimum age</OwnerField> to make an account. You can play
          every synth without one.
        </p>
      </LegalSection>

      <LegalSection title="The short version">
        <ul>
          <li>
            We keep what you make and do here (your account, your sounds, your profile, your lists
            of synths and how far you got through the lessons) so it is there when you come back, on
            any device.
          </li>
          <li>
            Nothing about you is public until you make it so. What you share or publish shows your
            username, never your name or email address.
          </li>
          <li>
            When you ask the tutor something, your message and the panel you have open go to an AI
            provider to be answered. A web search the tutor makes for you goes to Brave.
          </li>
          <li>Analytics run only if you accept optional cookies.</li>
          <li>
            You can download everything we hold about you, and delete your account and all of it.
          </li>
          <li>We do not sell your data, and we do not show adverts.</li>
        </ul>
      </LegalSection>

      <LegalSection title="What we keep, and why">
        <p>
          <strong>Your account.</strong> Your name, email address and password (stored only as a
          hash), whether you have confirmed the address, and the sessions you are signed in with,
          including the IP address and browser each one came from. If you sign in with Google, we
          keep the link to your Google account. We need these to let you in and keep your account
          safe.
        </p>
        <p>
          <strong>What you make.</strong> The sounds you save: the synth, the name and notes, the
          panel settings and cables, and the lesson that comes with a sound the tutor designed.
          Whether each one is private, shared or published, its tags, and the sound it was copied
          from, so the credit can link to it.
        </p>
        <p>
          <strong>Your profile and your synths.</strong> Your username, your links to YouTube,
          Spotify, Instagram and Bandcamp, who can see your page, and the synths you list as owned
          and as wanted.
        </p>
        <p>
          <strong>How you use the synths.</strong> The panel you last left on each synth, your synth
          page settings (hover help, the sound map, the harmonics strip and the effects rack), how
          far you got through each lesson, and what you starred.
        </p>
        <p>
          <strong>The tutor.</strong> Your conversations with it, and what each turn cost to answer.
          See <a href="#the-tutor">The tutor</a> below.
        </p>
        <p>
          <strong>Reports, suggestions and messages.</strong> Reports you file about shared sounds,
          synths you suggest for the databank, and anything you send through the contact form, so we
          can act on them and answer you.
        </p>
        <p>
          We use this data to run {BRAND.name} for you, which is the contract between us. We keep
          your account secure and shared sounds free of abuse because we have a legitimate interest
          in doing so. Analytics run only with your consent.
        </p>
      </LegalSection>

      <LegalSection title="What is public">
        <p>
          Your sounds are private until you share them. A sound shared with a link can be opened by
          anyone who has the link, signed in or not. It is not listed anywhere and is hidden from
          search engines. A sound you publish is listed on Explore, on your public page and in the
          site map search engines read, and anyone can play it. Anyone signed in can save a copy of
          a shared or published sound to their own account. A copy of a published sound credits it,
          under your username; a copy of a link share credits nobody, so your link is never passed
          on.
        </p>
        <p>
          You need a username to publish, and everything public is shown under it, never under your
          account name or email address. A username you give up is held for 30 days so nobody else
          can take it while old links still point to it.
        </p>
        <p>
          Your profile page is private until you switch it on in Settings. Once it is on, it shows
          your username, your links and your published sounds, and your owned and wanted synths only
          if you switch each list on as well.
        </p>
        <p>
          Links to your channels open the other site in a new tab. Nothing from YouTube, Spotify,
          Instagram or Bandcamp is loaded on {BRAND.name} itself.
        </p>
      </LegalSection>

      <LegalSection title="The tutor" id="the-tutor">
        <p>
          The tutor is answered by an AI model from{' '}
          <OwnerField>the tutor&apos;s AI provider</OwnerField>. When you send it a message, we send
          the provider your message, the synth you are on, the panel as you have it (its settings
          and cables), the conversation so far, and what the tutor looked up to answer you. We do
          not send your name, your email address or your username. The provider sends back the
          answer, and any change or sound it suggests.
        </p>
        <p>
          <OwnerField>
            what the provider&apos;s API terms say about training on what we send and how long it
            keeps it
          </OwnerField>{' '}
          Its own privacy policy applies to that processing. We will update this page if the tutor
          is answered by a different provider.
        </p>
        <p>
          <strong>Its searches.</strong> When the tutor searches the web for you, the search it
          writes is sent to Brave&apos;s Search API, from our server rather than your browser. When
          it searches the databank, the search may also be sent to{' '}
          <OwnerField>the embedding provider, OpenAI in the documented setup</OwnerField> to be
          matched by meaning. Neither is sent anything else about you.
        </p>
        <p>
          We keep your conversations with the tutor, so it can follow what you said earlier and you
          can pick one up again, until you delete your account.{' '}
          <OwnerField>
            whether tutor conversations should be deleted after a set time instead
          </OwnerField>
        </p>
        <p>
          The tutor can be wrong. Check what it tells you, especially about people and records, and
          trust your ears.
        </p>
      </LegalSection>

      <LegalSection title="Cookies, your browser and analytics">
        <p>
          <strong>Essential.</strong> A cookie keeps you signed in. Your cookie choice is kept in
          your browser&apos;s local storage.
        </p>
        <p>
          <strong>What the synth page keeps in your browser.</strong> The last synth you opened and
          the view you chose, each synth&apos;s panel as you left it and the shared sound it was
          opened from, your display choices (hover help, the sound map, the harmonics strip and the
          effects rack, and whether the rack is open), whether to reconnect your MIDI device, and
          when and under which account those settings last changed. Signed in, the settings and each
          synth&apos;s panel are also saved to your account so they follow you to other devices.
          Your MIDI devices are used only by the page in your browser.
        </p>
        <p>
          <strong>Optional.</strong> If you accept optional cookies, we count how {BRAND.name} is
          used with <OwnerField>analytics provider, or that none is used</OwnerField>.
        </p>
        <p>
          You can change your choice at any time from <em>Cookie Preferences</em> in the footer.
        </p>
      </LegalSection>

      <LegalSection title="Who else handles it">
        <p>We use these services to run {BRAND.name}, each only for its part:</p>
        <ul>
          <li>
            <OwnerField>hosting provider</OwnerField> hosts the app and its database, in{' '}
            <OwnerField>hosting region</OwnerField>.
          </li>
          <li>
            <OwnerField>the tutor&apos;s AI provider</OwnerField> answers the tutor, as above.
          </li>
          <li>
            <strong>Brave</strong> answers the tutor&apos;s web searches.
          </li>
          <li>
            <OwnerField>the embedding provider, OpenAI in the documented setup</OwnerField> matches
            the tutor&apos;s databank searches by meaning, when that is set up.
          </li>
          <li>
            <strong>Resend</strong> sends account emails (confirming your address and resetting your
            password) and passes on what you send through the contact form.
          </li>
          <li>
            <strong>Google</strong>, if you choose to sign in with it.{' '}
            <OwnerField>whether Google sign-in is offered</OwnerField>
          </li>
          <li>
            <OwnerField>
              error reporting (Sentry) and analytics providers, if either is switched on
            </OwnerField>
          </li>
        </ul>
        <p>
          Some of these are based outside <OwnerField>your region</OwnerField>. Where data leaves
          it, the transfer is covered by <OwnerField>transfer mechanism</OwnerField>.
        </p>
        <p>
          We do not sell your data or share it with anyone else, except where the law requires us
          to.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <ul>
          <li>Your account and what you made: until you delete them, or your account.</li>
          <li>Tutor conversations: until you delete your account.</li>
          <li>A username you give up: held for 30 days.</li>
          <li>
            Reports and synth suggestions: kept after you delete your account, without your name, so
            moderators and admins can still act on them.
          </li>
          <li>
            Backups of the database: <OwnerField>backup retention period</OwnerField>, after which
            anything you deleted is gone from them too.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          <strong>Download it.</strong> Signed in,{' '}
          {/* A file download from an API route, not a page: `<Link>` would prefetch it, building a whole export. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/v1/users/me/export" className={legalLink}>
            download your data
          </a>{' '}
          to get a copy of everything listed below, as one file.
        </p>
        <p>
          <strong>Delete it.</strong> <em>Delete Account</em>, on the Account tab of{' '}
          <Link href="/settings" className={legalLink}>
            Settings
          </Link>
          , deletes your account and everything in it, published sounds included. Copies other
          people saved of your sounds are theirs and stay with them, without the credit that named
          you. A report you filed, or a synth you suggested, is kept but no longer says who sent it.
          Nobody you report is ever told who reported them.
        </p>
        <p>
          <strong>Correct it.</strong> You can change your name, email address, username, links and
          everything you wrote from Settings and the synth page.
        </p>
        <p>
          You can also ask us to restrict or stop using your data, or object to how we use it, by
          writing to <OwnerField>privacy contact email</OwnerField>, and you can complain to{' '}
          <OwnerField>data protection authority</OwnerField>.
        </p>
      </LegalSection>

      <LegalSection title="Everything in your download">
        <p>
          This is the complete list of what we hold about a person, part by part, as your download
          names it. Most of the platform parts stay empty unless you run the site.
        </p>
        <h3 className="pt-2 font-semibold text-(--kys-text)">{BRAND.name}</h3>
        <ul data-testid="sources-app">
          {app.map((source) => (
            <li key={source.section}>
              <code className="font-mono text-[13px]">{source.section}</code>: {source.description}
            </li>
          ))}
        </ul>
        <h3 className="pt-2 font-semibold text-(--kys-text)">Your account and the platform</h3>
        <ul data-testid="sources-platform">
          {platform.map((source) => (
            <li key={source.section}>
              <code className="font-mono text-[13px]">{source.section}</code>: {source.description}
            </li>
          ))}
        </ul>
        <h3 className="pt-2 font-semibold text-(--kys-text)">If you run the site</h3>
        <p>
          Settings an administrator creates belong to the site, not to them, so they stay when their
          account is deleted. The download lists each one they created by name and date:
        </p>
        <p data-testid="sources-attribution">
          {attribution.map((source, i) => (
            <span key={source.section}>
              {i > 0 ? ', ' : ''}
              <code className="font-mono text-[13px]">{source.section}</code>
            </span>
          ))}
          .
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          When we change this policy we will update the date at the top, and tell you by email
          before a change that affects how your data is used takes effect.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
