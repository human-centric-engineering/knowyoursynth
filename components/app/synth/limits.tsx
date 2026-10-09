'use client';

/**
 * What this app does not reproduce on the synth in front of you, in a dialog: the things the panel prints but the
 * engine does not model, and the limits that apply to every synth here.
 *
 * Transliterated from the prototype file `src/ui/Limits.jsx` (decision D3). The text is the catalogue's `SynthNote`
 * rows (`LIMIT_INTRO`, `LIMIT`), read from the API by the page (D13), where the prototype read `src/lib/limits.js`.
 */

import type { SynthDetail } from '@/lib/app/catalogue/read';
import { useDialog } from '@/components/app/synth/use-dialog';

export interface LimitsProps {
  synth: { maker: string; name: string };
  limits: SynthDetail['notes']['limits'];
  open: boolean;
  onClose: () => void;
}

export function Limits({ synth, limits, open, onClose }: LimitsProps) {
  const { ref, close } = useDialog(open);
  return (
    <dialog
      ref={ref}
      aria-labelledby="limits-h"
      onClose={onClose}
      className="m-auto max-h-[calc(100vh-32px)] w-[min(700px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-(--kys-line) bg-(--kys-surface) p-0 text-(--kys-text) shadow-2xl backdrop:bg-black/60"
    >
      <div className="flex max-h-[calc(100vh-32px)] flex-col">
        <header className="border-b border-(--kys-line) px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="kys-label text-(--kys-accent)">
                {synth.maker} {synth.name}
              </p>
              <h2 id="limits-h" className="kys-display mt-1 text-[19px] leading-tight">
                What is not modelled
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="-mr-1 px-1 text-2xl leading-none text-(--kys-muted) hover:text-(--kys-text)"
            >
              ×
            </button>
          </div>
          {limits.intro ? (
            <p className="mt-2 mb-4 max-w-[78ch] text-[14.5px] leading-relaxed text-(--kys-text)/90">
              {limits.intro}
            </p>
          ) : (
            <div className="mb-4" />
          )}
        </header>

        <div className="kys-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {limits.items.length > 0 && (
            <>
              <p className="kys-label text-(--kys-muted)">On this synth</p>
              <dl className="mt-2.5 mb-5 flex flex-col gap-3">
                {limits.items.map((it) => (
                  <div
                    key={it.title}
                    className="rounded-xl border border-(--kys-line) bg-(--kys-ground) p-3.5"
                  >
                    <dt className="leading-snug font-semibold">{it.title}</dt>
                    <dd className="mt-1 text-[14px] leading-relaxed text-(--kys-muted)">
                      {it.text}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {limits.shared.length > 0 && (
            <>
              <p className="kys-label text-(--kys-muted)">True of every synth here</p>
              <dl className="mt-2.5 flex flex-col gap-3">
                {limits.shared.map((it) => (
                  <div key={it.title}>
                    <dt className="leading-snug font-semibold">{it.title}</dt>
                    <dd className="mt-0.5 text-[14px] leading-relaxed text-(--kys-muted)">
                      {it.text}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <p className="mt-5 text-sm leading-relaxed text-(--kys-faint)">
            Anything not listed here is modelled. Point at a control or a jack and the card tells
            you what it does; where a single control is only partly modelled, its own help says so.
          </p>
        </div>
      </div>
    </dialog>
  );
}
