import Link from 'next/link';

/**
 * Every miss on a shared pattern's address on a synth (`f-step-sequencer` t-83): made private, unlisted, deleted, never
 * shared, mistyped, or on a synth the catalogue does not serve. One message for all of them.
 */
export default function SharedPatternNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">This pattern isn&apos;t shared any more</h1>
      <p className="text-muted-foreground mt-2">
        Whoever made it may have stopped sharing it, or the link may be mistyped.
      </p>
      <Link href="/explore/patterns" className="mt-6 font-semibold underline hover:opacity-80">
        Explore published patterns
      </Link>
    </div>
  );
}
