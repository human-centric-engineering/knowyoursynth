import Link from 'next/link';

/**
 * Every miss on a shared sound's address (`f-sharing` h2): made private, deleted, never shared, or mistyped. One
 * message for all of them, so the page says nothing about which.
 */
export default function SharedSoundNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">This patch isn&apos;t shared any more</h1>
      <p className="text-muted-foreground mt-2">
        Whoever made it may have stopped sharing it, or the link may be mistyped.
      </p>
      <Link href="/explore" className="mt-6 font-semibold underline hover:opacity-80">
        Explore published patches
      </Link>
    </div>
  );
}
