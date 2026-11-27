'use client';

/**
 * The databank's instruments for the synth picker's "All synths ever made" (`f-synth-picker` t-330): read once from
 * `GET /api/v1/bank/instruments` when the picker first needs them, checked, and kept for the rest of the page's life,
 * so opening the picker again costs nothing. A failed read is tried again the next time the picker opens.
 */

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { apiClient } from '@/lib/api/client';
import { logger } from '@/lib/logging';
import {
  PickerInstrumentSchema,
  type PickerInstrument,
} from '@/components/app/synth/picker-entries';

const ListSchema = z.array(PickerInstrumentSchema);

export type BankInstrumentsState =
  | { status: 'idle' | 'loading' | 'failed'; instruments: undefined }
  | { status: 'ready'; instruments: readonly PickerInstrument[] };

let kept: Promise<readonly PickerInstrument[]> | undefined;

/** The list, read once and shared; a failed read is forgotten, so the next asks again. */
function readOnce(): Promise<readonly PickerInstrument[]> {
  kept ??= apiClient
    .get<unknown>('/api/v1/bank/instruments')
    .then((raw) => ListSchema.parse(raw))
    .catch((err: unknown) => {
      kept = undefined;
      throw err;
    });
  return kept;
}

/** Forget the kept list: for tests, which each start from nothing. */
export function __forgetBankInstruments(): void {
  kept = undefined;
}

/** The databank's instruments, read when `wanted` first turns true. */
export function useBankInstruments(wanted: boolean): BankInstrumentsState {
  const [state, setState] = useState<BankInstrumentsState>({
    status: 'idle',
    instruments: undefined,
  });
  const ready = state.status === 'ready';
  useEffect(() => {
    if (!wanted || ready) return undefined;
    let live = true;
    setState({ status: 'loading', instruments: undefined });
    readOnce()
      .then((instruments) => {
        if (live) setState({ status: 'ready', instruments });
      })
      .catch((err: unknown) => {
        logger.warn('synth picker: could not read every synth ever made', { err: String(err) });
        if (live) setState({ status: 'failed', instruments: undefined });
      });
    return () => {
      live = false;
    };
  }, [wanted, ready]);
  return state;
}
