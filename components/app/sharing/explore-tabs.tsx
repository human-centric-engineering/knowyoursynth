import Link from 'next/link';

/** Explore's two lists (`f-step-sequencer` t-83): published sounds, and published patterns. */
export function ExploreTabs({ current }: { current: 'sounds' | 'patterns' }) {
  const tabs = [
    ['sounds', 'Patches', '/explore'],
    ['patterns', 'Patterns', '/explore/patterns'],
  ] as const;
  return (
    <nav aria-label="Explore" className="mt-4 flex gap-4 text-sm">
      {tabs.map(([id, label, href]) => (
        <Link
          key={id}
          href={href}
          aria-current={id === current ? 'page' : undefined}
          className={
            id === current
              ? 'font-semibold text-(--kys-accent) underline underline-offset-4'
              : 'text-(--kys-muted) hover:text-(--kys-accent)'
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
