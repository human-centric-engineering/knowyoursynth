/**
 * The word check for a username (`f-profiles` r1), and for a shared sound's name and notes (`f-sharing` h1).
 *
 * Deliberately short, as BeatBreaker's is (`lib/app/breaks/community/words.ts` there): it catches the obvious, slurs
 * and the strongest profanity, and leaves the rest to reporting (`f-sharing` h3). A long list mostly refuses innocent
 * names; this one is kept to words with no innocent reading.
 *
 * Pure and synchronous: it runs in the settings form and in the API schema, which must refuse the same things.
 */
const BLOCKED = [
  'fuck',
  'shit',
  'cunt',
  'nigger',
  'nigga',
  'faggot',
  'retard',
  'whore',
  'slut',
  'bitch',
  'rapist',
  'nazi',
  'kike',
  'twat',
  'wanker',
] as const;

/**
 * Undo the usual disguises: case, separators, and digits standing in for letters. `F_u_c_k`, `sh1t` and `4dm1n` all
 * read as what they spell.
 */
export function normaliseForCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s._\-*]+/g, '')
    .replace(/0/g, 'o')
    .replace(/[1l!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/8/g, 'b');
}

/* The same list with its own disguise undone, so normaliseForCheck's l → i does not make "slut" unmatchable. */
const BLOCKED_NORMALISED = BLOCKED.map(normaliseForCheck);

/** Whether a username contains a blocked word anywhere. Substring: a username has no word boundaries to find. */
export function usernameIsBlocked(username: string): boolean {
  const flat = normaliseForCheck(username);
  return BLOCKED_NORMALISED.some((w) => flat.includes(w));
}

/*
 * What may follow a blocked word and still be that word: "fucking", "shitty", "nazis". Anything else is another word
 * that happens to start the same way ("shitake", "retardant"), and is let through.
 */
const ENDINGS = new Set(
  ['', ...'s es z y ty er ers ed ing in head heads face bag wit'.split(' ')].map(normaliseForCheck)
);

const isBlockedWord = (word: string) =>
  BLOCKED_NORMALISED.some((w) => word.startsWith(w) && ENDINGS.has(word.slice(w.length)));

/**
 * Whether free text (a sound's name or notes) contains a blocked word as a word. Word by word rather than substring,
 * so "Scunthorpe bass" is fine; a blocked word with a usual ending ("fucking") is caught.
 *
 * The disguises a username check undoes are undone here too: a word spelled out with separators ("f.u.c.k",
 * "s-h-i-t") is read whole, each part of a joined one ("bass.shit") on its own, and a run of single letters
 * ("f u c k") as one word.
 */
export function textIsBlocked(text: string): boolean {
  const tokens = text.split(/[^\p{L}\p{N}@$!|*._-]+/u).filter(Boolean);
  const words = tokens.flatMap((t) => [t, ...t.split(/[._*-]+/)]);
  let run = '';
  for (const t of [...tokens, '']) {
    if ([...t].length === 1) run += t;
    else {
      if (run.length > 1) words.push(run);
      run = '';
    }
  }
  return words.map(normaliseForCheck).some(isBlockedWord);
}
