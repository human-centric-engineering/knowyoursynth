'use client';

/**
 * What the synth in front of you is, in a dialog opened from About › in the row over the panel: its summary, as the
 * catalogue gives it. Its history and what this app does not model have their own links beside it.
 */

import { useDialog } from '@/components/app/synth/use-dialog';

export interface AboutProps {
  synth: { maker: string; name: string; summary: string };
  open: boolean;
  onClose: () => void;
}

export function About({ synth, open, onClose }: AboutProps) {
  const { ref, close } = useDialog(open);
  return (
    <dialog
      ref={ref}
      aria-labelledby="about-h"
      onClose={onClose}
      className="m-auto max-h-[calc(100vh-32px)] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-(--kys-line) bg-(--kys-surface) p-0 text-(--kys-text) shadow-2xl backdrop:bg-black/60"
    >
      <div className="kys-scroll max-h-[calc(100vh-32px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="kys-label text-(--kys-accent)">
              {synth.maker} {synth.name}
            </p>
            <h2 id="about-h" className="kys-display mt-1 text-[19px] leading-tight">
              About this {synth.name}
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
        <p className="mt-3 max-w-[72ch] text-[14.5px] leading-relaxed text-(--kys-text)/90">
          {synth.summary}
        </p>
      </div>
    </dialog>
  );
}
