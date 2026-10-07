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
import type { Midi } from '@/components/app/synth/use-midi';

/** "?" button that opens instructions in a dialog, instead of a paragraph taking up space on the page. */
export function HelpButton({
  title,
  items,
}: {
  title: string;
  items: readonly (readonly [term: string, text: string])[];
}) {
  return (
    <Dialog>
      <DialogTrigger
        aria-label={title}
        title={title}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-(--kys-line) bg-(--kys-surface) font-semibold text-(--kys-muted) hover:border-(--kys-muted) hover:text-(--kys-text)"
      >
        ?
      </DialogTrigger>
      <DialogContent className="w-[min(440px,calc(100vw-32px))] rounded-xl border-(--kys-line) bg-(--kys-raised) p-4 text-(--kys-text)">
        <DialogTitle className="kys-label text-(--kys-muted)">{title}</DialogTitle>
        <DialogDescription className="sr-only">{title}</DialogDescription>
        <dl className="flex flex-col gap-2.5 text-sm">
          {items.map(([t, d]) => (
            <div key={t}>
              <dt className="font-semibold">{t}</dt>
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
}: {
  label: string;
  title?: string;
  options: readonly (readonly [value: T, text: string])[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="flex rounded-md border border-(--kys-line) bg-(--kys-surface) p-0.5"
      role="group"
      aria-label={label}
      title={title}
    >
      {options.map(([v, l]) => (
        <button
          key={l}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`rounded px-2.5 py-1 font-semibold ${value === v ? 'bg-(--kys-text) text-(--kys-ground)' : 'text-(--kys-muted) hover:text-(--kys-text)'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const MIDI_NOTE: Record<Midi['status'], string> = {
  off: '',
  asking: 'Waiting for the browser to allow MIDI…',
  on: '',
  unsupported:
    'This browser has no MIDI support. Chrome and Edge on a computer do; Safari does not.',
  frame:
    'MIDI keyboards cannot connect while this page is shown inside another site. Open it on its own.',
  blocked:
    'MIDI was not allowed. If you did not see a browser prompt, the page this is shown in does not permit MIDI.',
};

export function MidiStatus({ midi, onConnect }: { midi: Midi; onConnect: () => void }) {
  const { status, devices } = midi;
  const note =
    status === 'on'
      ? devices.length
        ? `Listening to ${devices.join(', ')}`
        : 'MIDI is on, but no keyboard is connected. Plug one in and it is picked up straight away.'
      : MIDI_NOTE[status];
  const btn =
    'shrink-0 rounded-md border border-(--kys-line) bg-(--kys-surface) px-2.5 py-1 font-semibold text-(--kys-muted) hover:text-(--kys-text)';
  return (
    <div className="flex items-center gap-2 text-xs">
      {note && (
        <span
          role="status"
          className={`max-w-[46ch] text-right ${status === 'blocked' ? 'text-(--kys-warn)' : status === 'on' && devices.length ? 'text-(--kys-good)' : 'text-(--kys-faint)'}`}
        >
          {note}
        </span>
      )}
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
  );
}
