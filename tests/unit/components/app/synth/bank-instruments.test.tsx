// @vitest-environment happy-dom

/**
 * The databank's instruments for "All synths ever made" (`f-synth-picker` t-330): read once when first wanted, checked,
 * and shared; a failed read is tried again the next time; an answer that is not the list fails; one that arrives after
 * the picker has gone is dropped.
 *
 * @see components/app/synth/bank-instruments.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('@/lib/logging', () => ({ logger: { warn: vi.fn() } }));

import {
  __forgetBankInstruments,
  useBankInstruments,
} from '@/components/app/synth/bank-instruments';
import { apiClient } from '@/lib/api/client';

const LIST = [
  {
    id: 'moog-minimoog',
    name: 'Minimoog Model D',
    maker: 'Moog Music',
    year: '1970',
    kind: 'mono',
    summary: '',
    synths: [],
  },
];

beforeEach(() => {
  vi.mocked(apiClient.get).mockReset();
  __forgetBankInstruments();
});

describe('useBankInstruments', () => {
  it('reads nothing until wanted, then reads once and shares it', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(LIST);
    const { result, rerender } = renderHook(({ wanted }) => useBankInstruments(wanted), {
      initialProps: { wanted: false },
    });
    expect(result.current.status).toBe('idle');
    expect(apiClient.get).not.toHaveBeenCalled();
    rerender({ wanted: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.instruments).toEqual(LIST);
    // Another picker on the page shares the read.
    const other = renderHook(() => useBankInstruments(true));
    await waitFor(() => expect(other.result.current.status).toBe('ready'));
    expect(apiClient.get).toHaveBeenCalledOnce();
  });

  it('fails on an answer that is not the list, and tries again the next time it is wanted', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce([{ id: 'x' }])
      .mockResolvedValueOnce(LIST);
    const { result, rerender } = renderHook(({ wanted }) => useBankInstruments(wanted), {
      initialProps: { wanted: true },
    });
    await waitFor(() => expect(result.current.status).toBe('failed'));
    rerender({ wanted: false });
    rerender({ wanted: true });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('drops an answer that arrives after the picker has gone', async () => {
    let finish: (v: unknown) => void = () => undefined;
    vi.mocked(apiClient.get).mockReturnValue(new Promise((r) => (finish = r)));
    const { result, unmount } = renderHook(() => useBankInstruments(true));
    expect(result.current.status).toBe('loading');
    unmount();
    finish(LIST);
    await new Promise((r) => setTimeout(r));
    expect(result.current.status).toBe('loading');
  });
});
