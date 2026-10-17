import Link from 'next/link';

/**
 * `@username`, linking to `/u/<username>` only when that profile shows anything (`.context/app/sharing.md`, "The
 * byline"). Whether there is a byline at all is the read's answer (`author` is null when there is none to show).
 */
export function Byline({ author, authorProfile }: { author: string; authorProfile: boolean }) {
  return authorProfile ? (
    <Link href={`/u/${encodeURIComponent(author)}`} className="hover:text-(--kys-accent)">
      @{author}
    </Link>
  ) : (
    <span>@{author}</span>
  );
}
