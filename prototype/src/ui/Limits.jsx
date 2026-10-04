import { useEffect, useRef } from 'react';
import { SHARED, limitsFor } from '@/lib/limits.js';

/**
 * What this app does not reproduce on the synth in front of you, in a dialog: the things the panel
 * prints but the engine does not model, and the handful of limits that apply to all five.
 */
export function Limits({ def, open, onClose }) {
  const ref = useRef(null);
  const l = limitsFor(def.id);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!l) return null;

  return (
    <dialog ref={ref} aria-labelledby="limits-h" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current.close(); }}
      className="m-auto max-h-[calc(100vh-32px)] w-[min(700px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-text shadow-2xl backdrop:bg-black/60">
      <div className="flex max-h-[calc(100vh-32px)] flex-col">
        <header className="border-b border-line px-4 pt-4 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="kys-label text-accent">{def.maker} {def.name}</p>
              <h2 id="limits-h" className="mt-1 font-display text-[19px] leading-tight">What is not modelled</h2>
            </div>
            <button type="button" onClick={() => ref.current.close()} aria-label="Close" className="-mr-1 px-1 text-2xl leading-none text-muted hover:text-text">×</button>
          </div>
          <p className="mb-4 mt-2 max-w-[78ch] text-[14.5px] leading-relaxed text-text/90">{l.intro}</p>
        </header>

        <div className="kys-scroll min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {l.items.length > 0 && (
            <>
              <p className="kys-label text-muted">On this synth</p>
              <dl className="mt-2.5 flex flex-col gap-3">
                {l.items.map(([t, d]) => (
                  <div key={t} className="rounded-xl border border-line bg-ground p-3.5">
                    <dt className="font-semibold leading-snug">{t}</dt>
                    <dd className="mt-1 text-[14px] leading-relaxed text-muted">{d}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <p className="kys-label mt-5 text-muted">True of every synth here</p>
          <dl className="mt-2.5 flex flex-col gap-3">
            {SHARED.map(([t, d]) => (
              <div key={t}>
                <dt className="font-semibold leading-snug">{t}</dt>
                <dd className="mt-0.5 text-[14px] leading-relaxed text-muted">{d}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-sm leading-relaxed text-faint">
            Anything not listed here is modelled. Point at a control or a jack and the card tells you what it does; where a
            single control is only partly modelled, its own help says so.
          </p>
        </div>
      </div>
    </dialog>
  );
}
