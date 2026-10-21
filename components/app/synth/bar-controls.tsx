'use client';

/**
 * The small controls over and under the faceplate: the help buttons, the panel switches and the MIDI status.
 *
 * Transliterated from the prototype file `prototype/src/App.jsx` (decision D3), where they were defined inline.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ReactNode } from 'react';
import type { Midi } from '@/components/app/synth/use-midi';
import { PlayerTip } from '@/components/app/synth/player-tip';

/** "?" button that opens instructions in a dialog, instead of a paragraph taking up space on the page. */
export function HelpButton({
  title,
  items,
}: {
  title: string;
  /** Each a term and what it does, with the icon its button carries where it has one, so it can be found there. */
  items: readonly (readonly [term: string, text: string, icon?: ReactNode])[];
}) {
  return (
    <Dialog>
      <PlayerTip name={title}>
        <DialogTrigger
          aria-label={title}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-(--kys-line) bg-(--kys-surface) font-semibold text-(--kys-muted) hover:border-(--kys-muted) hover:text-(--kys-text)"
        >
          ?
        </DialogTrigger>
      </PlayerTip>
      <DialogContent className="w-[min(440px,calc(100vw-32px))] rounded-xl border-(--kys-line) bg-(--kys-raised) p-4 text-(--kys-text)">
        <DialogTitle className="kys-label text-(--kys-muted)">{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        <dl className="flex flex-col divide-y divide-(--kys-line)/60 text-sm">
          {items.map(([t, d, icon]) => (
            <div key={t} className="py-2.5 first:pt-0 last:pb-0">
              <dt className="flex items-center gap-2 font-semibold">
                {icon && (
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-(--kys-line) text-(--kys-muted)"
                  >
                    {icon}
                  </span>
                )}
                {t}
              </dt>
              <dd className="leading-snug text-(--kys-muted)">{d}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The three looks a panel switch can have. `start` is the one button that begins something rather than toggling
 * a view, so it is outlined in the accent colour even when it is off.
 */
const TONES = {
  start: [
    'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)',
    'border-(--kys-accent) bg-(--kys-surface) text-(--kys-accent) hover:bg-(--kys-accent) hover:text-(--kys-accent-ink)',
  ],
  view: [
    'border-(--kys-accent) bg-(--kys-accent) text-(--kys-accent-ink)',
    'border-(--kys-line) bg-(--kys-surface) text-(--kys-muted) hover:text-(--kys-text)',
  ],
  quiet: [
    'border-(--kys-line) bg-(--kys-surface) text-(--kys-text) hover:border-(--kys-muted)',
    'border-(--kys-line) bg-(--kys-surface) text-(--kys-muted) hover:text-(--kys-text)',
  ],
} as const;

/**
 * One of the switches over the faceplate. The full row of them needs about 1070px, so under `xl` each falls back
 * to a shorter label; the full wording stays in the tooltip and in the accessible name at every width, and each
 * short label is a substring of the long one so speaking the visible text still works.
 */
export function PanelSwitch({
  label,
  short,
  title,
  on,
  tone = 'view',
  onClick,
}: {
  label: string;
  short: string;
  title: string;
  on: boolean;
  tone?: keyof typeof TONES;
  onClick: () => void;
}) {
  const [onCls, offCls] = TONES[tone];
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={`rounded-md border px-2 py-1.5 font-semibold sm:px-2.5 ${on ? onCls : offCls}`}
    >
      <span className="xl:hidden">{short}</span>
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
}

/** A segmented switch: one of a few choices, the chosen one filled. */
export function Segmented<T extends string | number | boolean>({
  label,
  title,
  options,
  value,
  onChange,
  describedBy,
}: {
  label: string;
  title?: string;
  options: readonly (readonly [value: T, text: string])[];
  value: T;
  onChange: (v: T) => void;
  /** The id of what explains the choice, read out with the group's name. */
  describedBy?: string;
}) {
  return (
    <div
      className="flex rounded-md border border-(--kys-line) bg-(--kys-surface) p-1"
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      title={title}
    >
      {options.map(([v, l]) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded px-3.5 py-1 font-semibold ${value === v ? 'bg-(--kys-text) text-(--kys-ground)' : 'text-(--kys-muted) hover:text-(--kys-text)'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const MIDI_NOTE: Record<Midi['status'], string> = {
  off: 'MIDI is off.',
  asking: 'Waiting for the browser to allow MIDI…',
  on: '',
  unsupported:
    'This browser has no MIDI support. Chrome and Edge on a computer do; Safari does not.',
  frame:
    'MIDI keyboards cannot connect while this page is shown inside another site. Open it on its own.',
  blocked:
    'MIDI was not allowed. If you did not see a browser prompt, the page this is shown in does not permit MIDI.',
};

/** How to connect a keyboard, in the MIDI dialog. */
const MIDI_STEPS = [
  'Plug the keyboard into this computer by USB (or a USB MIDI interface), and switch it on.',
  'Use Chrome or Edge on a computer. Safari and phones cannot hear MIDI keyboards.',
  'Press Connect MIDI below, and choose Allow when the browser asks.',
  'Play: notes play the panel, and the mod wheel moves its mod wheel. A keyboard plugged in later is picked up straight away.',
] as const;

/** What to do when the browser said no, in the MIDI dialog. */
const MIDI_UNBLOCK = [
  'Click the icon at the left of the address bar, open Site settings, and set MIDI devices to Allow.',
  'Reload the page, then press Try MIDI again.',
  'If this page is shown inside another site, open it on its own: the site around it may not pass MIDI on.',
] as const;

/**
 * MIDI in the bar: one small button whose dot says how MIDI is (lit while a keyboard is heard, amber when the browser
 * said no), opening a dialog with what is true, the way to connect or stop, and how to connect a keyboard, rather
 * than a paragraph taking up the bar.
 */
export function MidiStatus({ midi, onConnect }: { midi: Midi; onConnect: () => void }) {
  const { status, devices } = midi;
  const heard = status === 'on' && devices.length > 0;
  const trouble = status === 'blocked' || status === 'unsupported' || status === 'frame';
  const note =
    status === 'on'
      ? devices.length
        ? `Listening to ${devices.join(', ')}`
        : 'MIDI is on, but no keyboard is connected. Plug one in and it is picked up straight away.'
      : MIDI_NOTE[status];
  const btn =
    'shrink-0 rounded-md border border-(--kys-line) bg-(--kys-surface) px-2.5 py-1 font-semibold text-(--kys-muted) hover:text-(--kys-text)';
  const dot = heard
    ? 'bg-(--kys-good) shadow-[0_0_6px_var(--kys-good)]'
    : trouble
      ? 'bg-(--kys-warn)'
      : status === 'on' || status === 'asking'
        ? 'bg-(--kys-accent)'
        : 'bg-(--kys-line)';
  return (
    <Dialog>
      <PlayerTip
        name="MIDI"
        help={
          heard
            ? note
            : trouble
              ? 'MIDI is not working here. Open to see why, and how to fix it.'
              : 'Play the panel from a MIDI keyboard plugged into this computer.'
        }
      >
        <DialogTrigger aria-label="MIDI" className="kys-layer">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
          <span>MIDI</span>
        </DialogTrigger>
      </PlayerTip>
      <DialogContent className="w-[min(480px,calc(100vw-32px))] rounded-xl border-(--kys-line) bg-(--kys-raised) p-4 text-(--kys-text)">
        <DialogTitle className="kys-label text-(--kys-muted)">MIDI keyboard</DialogTitle>
        <DialogDescription className="sr-only">
          Play the panel from a MIDI keyboard plugged into this computer.
        </DialogDescription>
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              role="status"
              className={`min-w-0 flex-1 ${trouble ? 'text-(--kys-warn)' : heard ? 'text-(--kys-good)' : 'text-(--kys-muted)'}`}
            >
              {note}
            </p>
            {status === 'on' ? (
              <button type="button" onClick={midi.disconnect} className={btn}>
                Stop MIDI
              </button>
            ) : (
              status !== 'unsupported' &&
              status !== 'frame' && (
                <button
                  type="button"
                  onClick={onConnect}
                  disabled={status === 'asking'}
                  className={`${btn} disabled:opacity-40`}
                >
                  {status === 'blocked' ? 'Try MIDI again' : 'Connect MIDI'}
                </button>
              )
            )}
          </div>
          {status === 'blocked' && (
            <section aria-label="If the browser blocked MIDI">
              <h3 className="font-semibold">If the browser blocked it</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 leading-snug text-(--kys-muted)">
                {MIDI_UNBLOCK.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ol>
            </section>
          )}
          <section aria-label="How to connect a MIDI keyboard">
            <h3 className="font-semibold">How to connect a keyboard</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 leading-snug text-(--kys-muted)">
              {MIDI_STEPS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
