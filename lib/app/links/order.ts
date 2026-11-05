/**
 * The order a list of links is shown in (`f-videos-and-links` t-179, owner ruling). Pure. Spec: `.context/app/links.md`.
 *
 * - **Ours first**, in the admin's order (then oldest first, so a tie reads the same every time).
 * - **Then everyone else's, popular more likely first, but not always.** Each link gets a weight from its popularity
 *   and the order is a weighted draw without replacement (Efraimidis–Spirakis: sort by `u^(1/w)`, `u` uniform in
 *   (0,1)), so the same list does not come back in the same order every visit, and a much-watched video still leads
 *   most of the time.
 *
 * Popularity: a view count when there is one (`log10(views + 10)`: 1 for none, 7 for ten million), else the admin's
 * 1–5 rating as `1 + rating` (2 to 6), else 3, about a thousand views. The weight is its square, so a video with ten
 * million views is drawn ahead of one with a thousand about five times as often as the other way round.
 */

export interface OrderableLink {
  ours: boolean;
  order: number;
  rating: number | null;
  views: number | null;
  createdAt: Date;
}

/** How popular a link reads, before squaring. */
export function popularity(link: Pick<OrderableLink, 'rating' | 'views'>): number {
  if (link.views !== null && link.views >= 0) return Math.log10(link.views + 10);
  if (link.rating !== null) return 1 + link.rating;
  return 3;
}

/** A link's weight in the draw. Always positive. */
export function weight(link: Pick<OrderableLink, 'rating' | 'views'>): number {
  return popularity(link) ** 2;
}

/**
 * The links in the order to show them. `random` returns a number in [0, 1), as `Math.random` does; tests pass a seeded
 * one. Every link comes back exactly once; the input is not changed.
 */
export function orderLinks<T extends OrderableLink>(
  links: readonly T[],
  random: () => number = Math.random
): T[] {
  const ours = links
    .filter((l) => l.ours)
    .sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime());
  const theirs = links
    .filter((l) => !l.ours)
    // 1 - random() is in (0, 1], so the key is never 0 ** x and a zero draw cannot tie every link at the bottom.
    .map((link) => ({ link, key: (1 - random()) ** (1 / weight(link)) }))
    .sort((a, b) => b.key - a.key)
    .map((k) => k.link);
  return [...ours, ...theirs];
}
