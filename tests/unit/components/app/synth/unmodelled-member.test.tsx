// @vitest-environment happy-dom

/**
 * The blank panel an unmodelled family member shows in the panel's place (`f-synth-families` t-321).
 *
 * @see components/app/synth/unmodelled-member.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UnmodelledMember } from '@/components/app/synth/unmodelled-member';
import type { FamilyMember } from '@/lib/app/families/read';

const MINIMOOG: FamilyMember = {
  slug: 'minimoog',
  label: 'Minimoog',
  synthId: null,
  instrument: { id: 'moog-minimoog', name: 'Minimoog Model D', maker: 'Moog', year: '1970' },
  differences: 'The original, with a wooden case.\n\nIts oscillators drift as it warms up.',
};

describe('UnmodelledMember', () => {
  it('names the member, its maker and year, and says what it changed, a paragraph each', () => {
    render(<UnmodelledMember member={MINIMOOG} backName="Model D" onBack={vi.fn()} />);
    const face = screen.getByRole('region', { name: 'Moog Minimoog Model D, not modelled' });
    expect(screen.getByRole('heading', { name: 'Moog Minimoog Model D' })).toBeTruthy();
    expect(face.textContent).toContain('1970');
    expect(screen.getByText('The original, with a wooden case.').tagName).toBe('P');
    expect(screen.getByText('Its oscillators drift as it warms up.').tagName).toBe('P');
  });

  it('has nothing to play: its one control is the way back', () => {
    const onBack = vi.fn();
    render(<UnmodelledMember member={MINIMOOG} backName="Model D" onBack={onBack} />);
    const controls = screen.getAllByRole('button');
    expect(controls.map((b) => b.textContent)).toEqual(['Back to the Model D']);
    expect(screen.queryByRole('slider')).toBeNull();
    fireEvent.click(controls[0]);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
