/**
 * A family member nobody has modelled (`f-synth-families` t-321): the Minimoog behind the Model D, an ARP Odyssey
 * revision. Chosen in the version toggle, it takes the panel's place as a blank faceplate with the member's name, maker
 * and year, and what it changed from the others. Nothing on it plays. See `.context/app/synth-families.md`.
 */

import type { FamilyMember } from '@/lib/app/families/read';

export interface UnmodelledMemberProps {
  member: FamilyMember;
  /** The modelled member whose page this is: the way back, to the panel as it was left. */
  backName: string;
  onBack: () => void;
}

export function UnmodelledMember({ member, backName, onBack }: UnmodelledMemberProps) {
  const { instrument } = member;
  const paragraphs = member.differences
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <section
      aria-label={`${instrument.maker} ${instrument.name}, not modelled`}
      className="px-2 pt-2 pb-6"
    >
      <div className="kys-synth-shadow mx-auto flex min-h-[320px] max-w-[1100px] flex-col gap-4 rounded-lg border border-(--kys-line) bg-(--kys-surface) px-6 py-8 sm:px-10">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="kys-sound-title">
            {instrument.maker} {instrument.name}
          </h2>
          <span className="text-sm text-(--kys-muted)">{instrument.year}</span>
        </header>
        <p className="kys-label text-(--kys-faint)">
          Not modelled yet: nothing on this panel plays.
        </p>
        <div className="flex max-w-[68ch] flex-col gap-3 text-[15px] leading-relaxed text-(--kys-text)">
          {paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        <p className="mt-auto pt-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md border border-(--kys-line) bg-(--kys-ground) px-3.5 py-2 text-xs font-semibold text-(--kys-muted) hover:text-(--kys-text)"
          >
            Back to the {backName}
          </button>
        </p>
      </div>
    </section>
  );
}
