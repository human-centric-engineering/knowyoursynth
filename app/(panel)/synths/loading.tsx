/**
 * Synth page loading skeleton.
 *
 * Shown while a synth page reads its synth from the API: on arrival, and when the picker moves to another synth.
 * Laid out as the page is (picker bar, then the stage with the faceplate), so nothing jumps when it arrives.
 */

export default function SynthLoading() {
  return (
    <div
      role="status"
      aria-label="Loading the synth"
      className="mx-auto flex w-full max-w-[1720px] flex-col gap-5 px-4 pt-4 pb-10 sm:px-6"
    >
      <div className="flex items-center justify-between">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-(--kys-surface)" />
        <div className="h-10 w-36 animate-pulse rounded-lg bg-(--kys-surface)" />
      </div>
      <div className="rounded-2xl border border-(--kys-line) bg-(--kys-desk) p-3 sm:p-5">
        <div className="mb-3 h-10 w-80 animate-pulse rounded bg-(--kys-surface)" />
        <div className="aspect-[3/1] w-full animate-pulse rounded-lg bg-(--kys-surface)" />
      </div>
    </div>
  );
}
