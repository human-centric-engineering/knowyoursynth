import '@/components/app/marketing/faces';

import type { Metadata } from 'next';
import Link from 'next/link';

import { OwnerField } from '@/components/app/legal/owner-field';
import { BRAND } from '@/lib/brand';

/**
 * `/about`: who makes the app, how the panels are modelled, and the not-affiliated notice in full (`f-front-door` t-63,
 * `.context/app/planning/site-copy.md` §2). The footer carries the one-line version (`lib/app/footer.ts`). The route
 * file is a one-line shim re-exporting this module (CUSTOMIZATION.md §6).
 *
 * The maker list in the notice is every company a listed synth names as its maker or in its heritage line. It is a
 * list of fact, kept fixed here: add a name when a ported synth brings a new one. The notice holds without it
 * ("including").
 */

const description = `Who makes ${BRAND.name}, how the panels are modelled, and what they don't model. Independent, and not affiliated with any synth maker.`;

export const metadata: Metadata = {
  title: 'About',
  description,
  openGraph: { title: `About - ${BRAND.name}`, description },
  twitter: { card: 'summary_large_image', title: `About - ${BRAND.name}`, description },
};

const textLink = 'text-(--kys-accent) underline-offset-4 hover:underline';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="kys-display text-[20px] leading-tight sm:text-[22px]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-(--kys-muted)">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <article className="kys-frame mx-auto w-full max-w-[720px] px-4 py-12 text-(--kys-text) sm:px-6 md:py-16">
      <header className="border-b border-(--kys-line) pb-6">
        <p className="kys-label text-(--kys-accent)">About</p>
        <h1 className="kys-display mt-1 text-[28px] leading-tight sm:text-[32px]">
          About {BRAND.name}
        </h1>
        <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-(--kys-muted)">
          <p>
            {BRAND.name} is for people who own a synth, or are thinking about one, and want to
            understand it properly. Not just which knob does what, but why a sound is made the way
            it is, and how to make your own.
          </p>
          <p>
            <OwnerField>
              the origin story, in at most three sentences. Why you built it, and for whom.
            </OwnerField>
          </p>
        </div>
      </header>

      <Section title="How the panels are made">
        <p>
          Each synth is laid out from its published specification and manual: the same controls,
          switches and jacks in the same places, with the same ranges and the same routing. The
          modular systems are patched with cables, as the hardware is.
        </p>
        <p>
          Behind every panel is one shared digital voice. That is why a sound loads instantly and
          why the controls behave as they do on the hardware. It is also why the panel is a model
          and not a copy: component tolerances, tuning drift and the particular distortion of one
          circuit are approximated, not reproduced.
        </p>
        <p>
          Every synth has a <strong className="text-(--kys-text)">What is not modelled</strong> list
          on its page that says where it differs, and some things are true of all of them. There is
          no microphone or line input, and the hardware&apos;s own MIDI sockets and power switches
          are drawn for reference only.
        </p>
        <p>
          The descriptions, lessons and notes are written for this app, in our own words. We
          don&apos;t copy manuals.
        </p>
      </Section>

      <Section title="Two ways a panel can look">
        <p>
          Each panel has the same layout, controls, colours and lettering as the hardware. By
          default it leaves out the maker&apos;s logos, wordmarks and model badges: the{' '}
          <strong className="text-(--kys-text)">neutral</strong> design. A synth whose maker has
          agreed to it can show its <strong className="text-(--kys-text)">faithful</strong> design,
          with those marks in place. The sounds and lessons are the same on both. The app&apos;s
          text names every synth either way, so you know which instrument you are learning.
        </p>
      </Section>

      <Section title="The tutor">
        <p>
          The tutor is an AI model given the synth on your screen and a few tools: it can read the
          panel, search the databank and search the web. It suggests changes rather than making
          them, and you choose whether to apply each one. What you type to it is sent to an AI
          provider to be answered, and its web searches go to a search service. The{' '}
          <Link href="/privacy" className={textLink}>
            privacy policy
          </Link>{' '}
          names both.
        </p>
      </Section>

      <Section title="The databank">
        <p>
          The databank is compiled for this app from facts: who played what on which record, who
          designed which instrument, and when. Instruments added for completeness each link the page
          their facts were checked against. If something is wrong,{' '}
          <Link href="/contact" className={textLink}>
            tell us
          </Link>{' '}
          and we will fix it. Synth people will know.
        </p>
      </Section>

      <Section title="Not affiliated with any synth maker">
        <p>
          {BRAND.name} is an independent learning tool. It is not made, endorsed, sponsored or
          approved by any of the companies whose instruments it models or lists, including ARP,
          Behringer, Buchla, EMS, Korg, Moog, Oberheim, Roland and Sequential, or by the people and
          estates behind them.
        </p>
        <p>
          Product names, model names and maker names are trademarks of their owners. They are used
          here only to say which instrument a panel models or a record was played on. Where a panel
          shows a maker&apos;s marks, it is because that maker has agreed to it.
        </p>
        <p>
          The panels are models made for learning. They are not the instruments, and they are not
          sold as substitutes for them. If you are a maker or rights holder and something here
          concerns you,{' '}
          <Link href="/contact" className={textLink}>
            contact us
          </Link>{' '}
          and we will look at it promptly.
        </p>
      </Section>

      <Section title="Who makes it">
        <p>
          {BRAND.name} is made by HCE Studio.{' '}
          <Link href="/contact" className={textLink}>
            Get in touch
          </Link>
          .
        </p>
      </Section>
    </article>
  );
}
