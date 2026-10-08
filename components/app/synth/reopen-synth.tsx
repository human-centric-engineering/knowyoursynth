'use client';

/**
 * `/synths` with no id: reopen the synth this browser opened last (plan §3, `kys.synth`), or the first listed one.
 * A prototype hash link (`#model-d/outline`) wins over both.
 *
 * This stands in for the catalogue until one is planned (journal, `f-model-d`: "`/synths` reopens the last synth
 * until a catalogue exists").
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { hashRoute, synthHref } from '@/components/app/synth/routes';
import { STORAGE_KEYS, readStored } from '@/components/app/synth/storage';

/** Where `/synths` goes: the hash link, else the stored synth if it is still listed, else the first listed one. */
export function reopenTarget(ids: readonly string[], hash: string, stored: unknown): string | null {
  const listed = (id: string) => ids.includes(id);
  const fromHash = hashRoute(hash, listed);
  if (fromHash) return fromHash;
  const last = z.string().safeParse(stored);
  if (last.success && listed(last.data)) return synthHref(last.data);
  return ids[0] ? synthHref(ids[0]) : null;
}

export function ReopenSynth({ ids }: { ids: readonly string[] }) {
  const router = useRouter();
  const empty = ids.length === 0;
  useEffect(() => {
    const target = reopenTarget(ids, window.location.hash, readStored(STORAGE_KEYS.synth));
    if (target) router.replace(target);
  }, [ids, router]);

  return (
    <p role="status" className="px-4 py-16 text-center text-(--kys-muted)">
      {empty ? 'No synths are listed yet.' : 'Opening your synth…'}
    </p>
  );
}
