// @vitest-environment happy-dom

/**
 * The My patterns hook (`f-step-sequencer` t-81): it reads the list only when asked, keeps it in step with each write
 * the API answers, and writes nothing into a list it has not read.
 *
 * @see components/app/sequencer/use-my-patterns.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMyPatterns } from '@/components/app/sequencer/use-my-patterns';
import { newPattern } from '@/lib/app/sequencer/pattern';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/lib/api/client', () => ({ apiClient: api }));

const detail = (id: string, name: string) => ({
  id,
  name,
  synthId: 'model-d',
  steps: 16,
  parts: 1,
  pattern: newPattern(),
  problems: [],
  createdAt: '2026-10-22T00:00:00.000Z',
  updatedAt: '2026-10-22T00:00:00.000Z',
});
const summary = (id: string, name: string) => {
  const { pattern: _p, problems: _q, ...s } = detail(id, name);
  return s;
};

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
});

describe('useMyPatterns', () => {
  it('reads nothing until asked, then the list', async () => {
    api.get.mockResolvedValue([summary('p1', 'One')]);
    const { result } = renderHook(() => useMyPatterns());
    expect(result.current.patterns).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
    await act(() => result.current.refresh());
    expect(api.get).toHaveBeenCalledWith('/api/v1/patterns');
    expect(result.current.patterns).toEqual([summary('p1', 'One')]);
  });

  it('puts a saved pattern at the top without its steps, and a renamed one in its place at the top', async () => {
    api.get.mockResolvedValue([summary('p1', 'One'), summary('p2', 'Two')]);
    const { result } = renderHook(() => useMyPatterns());
    await act(() => result.current.refresh());

    api.post.mockResolvedValue(detail('p3', 'Three'));
    await act(async () => void (await result.current.create('Three', newPattern(), 'model-d')));
    expect(api.post).toHaveBeenCalledWith('/api/v1/patterns', {
      body: { name: 'Three', pattern: newPattern(), synthId: 'model-d' },
    });
    expect(result.current.patterns?.map((p) => p.id)).toEqual(['p3', 'p1', 'p2']);
    expect(result.current.patterns?.[0]).not.toHaveProperty('pattern');

    api.patch.mockResolvedValue(detail('p2', 'Deux'));
    await act(async () => void (await result.current.update('p2', { name: 'Deux' })));
    expect(api.patch).toHaveBeenCalledWith('/api/v1/patterns/p2', { body: { name: 'Deux' } });
    expect(result.current.patterns?.map((p) => p.name)).toEqual(['Deux', 'Three', 'One']);

    api.delete.mockResolvedValue(undefined);
    await act(() => result.current.remove('p3'));
    expect(api.delete).toHaveBeenCalledWith('/api/v1/patterns/p3');
    expect(result.current.patterns?.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('writes nothing into a list it has not read, so the first read is the whole truth', async () => {
    const { result } = renderHook(() => useMyPatterns());
    api.post.mockResolvedValue(detail('p3', 'Three'));
    await act(async () => void (await result.current.create('Three', newPattern(), 'model-d')));
    api.delete.mockResolvedValue(undefined);
    await act(() => result.current.remove('p3'));
    expect(result.current.patterns).toBeNull();
  });

  it('opens one with its steps', async () => {
    api.get.mockResolvedValue(detail('p 1', 'One'));
    const { result } = renderHook(() => useMyPatterns());
    expect(await result.current.open('p 1')).toEqual(detail('p 1', 'One'));
    expect(api.get).toHaveBeenCalledWith('/api/v1/patterns/p%201');
  });
});
