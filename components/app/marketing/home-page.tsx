import '@/components/app/marketing/faces';

import type { Metadata } from 'next';
import Link from 'next/link';

import { drawHeroPanel, HeroPanel } from '@/components/app/marketing/hero-panel';
import { synthHref } from '@/components/app/synth/routes';
import { listSynths } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { BRAND } from '@/lib/brand';

/**
 * `/`: the home page (`f-front-door` t-63), in the words of `.context/app/planning/site-copy.md` §1. The route file is
 * a one-line shim re-exporting this module (CUSTOMIZATION.md §6).
 *
 * The synth list and the first synth are the catalogue's (`listSynths`, the read `GET /api/v1/synths` serves), so the
 * page names what is there and counts nothing (the copy's "No counts" rule): a synth added to the catalogue appears
 * here with no change to this file.
 */

const description =
  "Play a synth's panel in your browser, find out what every control does, and work through its patches one step at a time. Free to use.";

export const metadata: Metadata = {
  // Absolute: the `(public)` template would append the brand a second time.
  title: { absolute: `${BRAND.name} — learn the synths you own` },
  description,
  openGraph: { description, type: 'website' },
  twitter: { card: 'summary_large_image', description },
};

const primary =
  'inline-flex h-11 items-center rounded-md bg-(--kys-accent) px-5 text-[15px] font-semibold text-(--kys-accent-ink) hover:opacity-90';
const textLink = 'text-(--kys-accent) underline-offset-4 hover:underline';

const features: { title: string; body: string[]; link: { href: string; label: string } }[] = [
  {
    title: 'Hear what each control does',
    body: [
      'Point at a knob and the panel tells you what it is for, what it does to the patch on the panel now, and anything unusual about it on this synth. Turn it and listen. The sound map shows which parts of the panel the current patch is using, and which controls change it most.',
    ],
    link: { href: '/synths', label: 'Open a synth' },
  },
  {
    title: 'Learn the patches one step at a time',
    body: [
      'Each synth comes with a library of patches, and every one is a lesson. Start from a basic patch and add one change at a time, with a line on why, until you have the whole patch. Then the lesson suggests what to try next to make it your own.',
    ],
    link: { href: '/synths', label: 'Open a synth' },
  },
  {
    title: 'Ask the tutor',
    body: [
      'The tutor knows the panel in front of you. Ask why a patch behaves the way it does, or how to make it darker, and it suggests changes you can apply and undo. Describe a patch and it builds one on this synth, with its own lesson. Under each answer it says where the answer came from, or that it came from what the tutor already knows.',
      "It can be wrong. Treat what it says as a starting point and trust your ears. It's free with an account, up to a daily allowance.",
    ],
    link: { href: '/signup', label: 'Create a free account' },
  },
  {
    title: 'Look things up in the databank',
    body: [
      'Instruments, artists and records, joined up. Find out who played what on which record, which synths came from which designers, and which modern instruments are modelled on older ones. From a record, load a patch in its style on the synth that played it.',
    ],
    link: { href: '/bank', label: 'Open the databank' },
  },
  {
    title: 'Keep your patches, and share the good ones',
    body: [
      'Save patches to your account and pick up where you left off on any computer. Mark the synths you own and the ones you want. Share a patch with a link, or publish it to Explore for other people to play and learn from. It appears under a username you choose, never your name or email.',
    ],
    link: { href: '/explore', label: 'See what people have made' },
  },
];

const questions: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Do I need an account?',
    a: "No, to play a synth and work through its lessons. Your panel is kept in your browser. An account saves your patches and your progress, lets you ask the tutor, and lets you share. It's free.",
  },
  {
    q: 'Do I need the hardware?',
    a: "No. Everything plays in the browser. A MIDI keyboard works in Chrome and Edge if you have one; a computer keyboard works if you don't.",
  },
  {
    q: 'Does it work on a phone?',
    a: 'You can read and look things up on a phone. Playing a full panel needs a computer, or a tablet held sideways.',
  },
  {
    q: 'Does it sound exactly like the hardware?',
    a: 'No, and it doesn\'t try to. Every panel drives one shared voice, built so the controls do what they do on the hardware. Close enough to learn on, not a substitute for the instrument. Each synth\'s "What is not modelled" list says where it differs.',
  },
  {
    q: 'Is it made by the synth makers?',
    a: (
      <>
        No. {BRAND.name} is independent.{' '}
        <Link href="/about" className={textLink}>
          About
        </Link>{' '}
        says more.
      </>
    ),
  },
];

function SectionHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="kys-display scroll-mt-20 text-[22px] leading-tight sm:text-[26px]">
      {children}
    </h2>
  );
}

export default async function HomePage() {
  const synths = await listSynths();
  const first = synths[0];
  const firstDef = first ? getSynthDef(first.id) : null;
  const panel = first && firstDef ? await drawHeroPanel(firstDef, first.design) : null;
  const play = first
    ? { href: synthHref(first.id), label: `Play the ${first.name}` }
    : { href: '/synths', label: 'Open a synth' };

  return (
    <div className="kys-frame text-(--kys-text)">
      <section className="mx-auto grid w-full max-w-[1120px] grid-cols-[minmax(0,1fr)] gap-10 px-4 pt-12 pb-14 sm:px-6 md:pt-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
        <div>
          <h1 className="kys-display text-[30px] leading-tight sm:text-[38px]">
            Get to know your synth.
          </h1>
          <p className="mt-5 max-w-[34rem] text-[17px] leading-relaxed text-(--kys-muted)">
            Play the panel in your browser. Point at any control to find out what it does. Then
            build the patches one step at a time, until you could make them on the hardware without
            the app.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href={play.href} className={primary}>
              {play.label}
            </Link>
            <a href="#synths" className={`${textLink} text-[15px]`}>
              See all the synths
            </a>
          </div>
        </div>
        {first && panel && <HeroPanel name={first.name} panel={panel} />}
      </section>

      <section className="border-y border-(--kys-line) bg-(--kys-surface)">
        <div className="mx-auto w-full max-w-[960px] px-4 py-12 sm:px-6">
          <SectionHeading id="synths">The synths, panel by panel</SectionHeading>
          <p className="mt-3 max-w-[44rem] text-[15px] leading-relaxed text-(--kys-muted)">
            Monosynths, polysynths, semi-modulars and modular systems, from early classics to
            instruments still in the shops. Each one is laid out like the hardware, with the same
            controls in the same places. More are added as they are ready.
          </p>
          {synths.length > 0 && (
            <ul className="mt-6 divide-y divide-(--kys-line) border-y border-(--kys-line)">
              {synths.map((s) => (
                <li key={s.id}>
                  <Link
                    href={synthHref(s.id)}
                    className="group block py-3 hover:bg-(--kys-raised) sm:grid sm:grid-cols-[minmax(0,14rem)_minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-baseline sm:gap-x-4 sm:px-2"
                  >
                    {/* One line on a phone, name then year; on a wider screen these join the row's grid. */}
                    <span className="flex items-baseline justify-between gap-3 sm:contents">
                      <span className="font-semibold group-hover:text-(--kys-accent)">
                        {s.name}
                      </span>
                      <span className="font-mono text-[13px] text-(--kys-faint) sm:order-last">
                        {s.year}
                      </span>
                    </span>
                    <span className="block text-[13px] text-(--kys-muted) sm:text-[14px]">
                      {s.maker}
                    </span>
                    <span className="block text-[13px] text-(--kys-muted)">{s.heritage}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-5 text-[15px]">
            Don&apos;t see yours?{' '}
            <Link href="/contact" className={textLink}>
              Tell us which one
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[960px] px-4 py-14 sm:px-6">
        <p className="kys-label text-(--kys-accent)">What you can do</p>
        <div className="mt-6 grid gap-x-10 gap-y-10 md:grid-cols-2">
          {features.map((f) => (
            <div key={f.title}>
              <h3 className="text-[18px] font-semibold">{f.title}</h3>
              {f.body.map((para) => (
                <p key={para} className="mt-2 text-[15px] leading-relaxed text-(--kys-muted)">
                  {para}
                </p>
              ))}
              <Link
                href={f.link.href}
                className={`${textLink} mt-3 inline-block text-[15px] font-medium`}
              >
                {f.link.label} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-(--kys-line) bg-(--kys-surface)">
        <div className="mx-auto w-full max-w-[960px] px-4 py-12 sm:px-6">
          <SectionHeading>Not a replacement for the instrument</SectionHeading>
          <p className="mt-3 max-w-[44rem] text-[15px] leading-relaxed text-(--kys-muted)">
            Each panel is a model of the synth: the same controls and the same signal path, so what
            you learn carries across. It doesn&apos;t reproduce the hardware&apos;s circuits, and
            each synth says what it doesn&apos;t model. If you own the synth, use the app to get to
            know it, then go and play the real one. If you don&apos;t own it yet, you will have a
            good idea of what it does before you buy.
          </p>
          <Link href="/about" className={`${textLink} mt-3 inline-block text-[15px] font-medium`}>
            How the panels are made →
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[960px] px-4 py-14 sm:px-6">
        <SectionHeading>Questions</SectionHeading>
        <dl className="mt-6 divide-y divide-(--kys-line) border-y border-(--kys-line)">
          {questions.map(({ q, a }) => (
            <div key={q} className="py-4">
              <dt className="font-semibold">{q}</dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-(--kys-muted)">{a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-(--kys-line) bg-(--kys-surface)">
        <div className="mx-auto flex w-full max-w-[960px] flex-col items-start gap-5 px-4 py-14 sm:px-6">
          <SectionHeading>Pick a synth and press a key.</SectionHeading>
          <Link href={play.href} className={primary}>
            {play.label}
          </Link>
        </div>
      </section>
    </div>
  );
}
