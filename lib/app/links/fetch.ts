/**
 * The one way the links code reads from another site (`f-videos-and-links` t-180). Server-side only. Spec:
 * `.context/app/links.md` → "Reading from providers".
 *
 * Each caller names the hosts it may reach, so a URL an admin pasted can never send the server anywhere else (SSRF):
 *
 * - **https only, on an allowed host**, matched exactly, checked before anything is sent.
 * - **No redirects.** A redirect's target would be a host nobody checked, so it is a failure, not a hop.
 * - **A timeout and a size cap.** A body over the cap is a failure (`stopAt` ends an HTML read early, once the part
 *   wanted has arrived, so a page's long body never counts against it).
 * - **Through the outbound dispatcher**, which refuses a name resolving to a private address where it pins (a
 *   customer org). The admin routes and the refresh job run as the install org, where it does not: there the exact
 *   host allowlist above is the guard, and every allowed host is a provider's own.
 *
 * Every failure is `null` and a log line, never a throw: what was read is a suggestion, and the admin's own words stand
 * without it.
 */
import { logger } from '@/lib/logging';
import { withOutboundDispatcher } from '@/lib/security/safe-dispatcher';

export interface ReadOptions {
  /** The hosts this read may reach, exactly. */
  hosts: ReadonlySet<string>;
  maxBytes: number;
  timeoutMs: number;
  accept: string;
  /** Stop reading once the text read so far contains this, in any case (an HTML page's `</head>`). */
  stopAt?: string;
  /** What the read is for, in the log line. Never the URL, which can carry a key. */
  purpose: string;
}

/** The host of an https URL with no login and no port, or null. */
function httpsHost(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  return url.hostname.toLowerCase();
}

/** The body as text, at most `maxBytes`; null when it is longer and `stopAt` did not end it first. */
async function readCapped(
  response: Response,
  maxBytes: number,
  stopAt: string | undefined
): Promise<string | null> {
  const declared = Number(response.headers.get('content-length'));
  if (!stopAt && Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const stop = stopAt?.toLowerCase();
  let text = '';
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      const chunk = decoder.decode(value, { stream: true });
      // Only the new text, and the end of the old that a match could start in, can hold a first match.
      const from = Math.max(0, text.length - (stop?.length ?? 0) + 1);
      text += chunk;
      // Checked before the cap, so a head ending in the chunk that crosses it still counts (one chunk over, at most).
      if (stop && text.slice(from).toLowerCase().includes(stop)) return text;
      if (bytes > maxBytes) return null;
    }
  } finally {
    // Stops the download: a page past its head, or past the cap, is not read to the end.
    try {
      await reader.cancel();
    } catch {
      // Already closed: nothing left to stop.
    }
  }
}

/** GET `url` as text under the rules above, or null. */
export async function readText(url: string, options: ReadOptions): Promise<string | null> {
  const host = httpsHost(url);
  if (!host || !options.hosts.has(host)) {
    logger.warn('Links: refused to read from a host not allowed', {
      purpose: options.purpose,
      host,
    });
    return null;
  }
  try {
    const response = await fetch(
      url,
      withOutboundDispatcher({
        method: 'GET',
        headers: { Accept: options.accept },
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs),
      })
    );
    if (!response.ok) {
      // Not read: an error page is not what was asked for. Cancelling cannot fail on an unread body.
      await response.body?.cancel();
      logger.warn('Links: provider answered with an error', {
        purpose: options.purpose,
        host,
        status: response.status,
      });
      return null;
    }
    const text = await readCapped(response, options.maxBytes, options.stopAt);
    if (text === null)
      logger.warn('Links: provider reply too large', {
        purpose: options.purpose,
        host,
        maxBytes: options.maxBytes,
      });
    return text;
  } catch (err) {
    logger.warn('Links: could not read from provider', {
      purpose: options.purpose,
      host,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return null;
  }
}

/** GET `url` as JSON under the rules above, or null (including when it is not JSON). */
export async function readJson(
  url: string,
  options: Omit<ReadOptions, 'accept' | 'stopAt'>
): Promise<unknown> {
  const text = await readText(url, { ...options, accept: 'application/json' });
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    logger.warn('Links: provider reply was not JSON', { purpose: options.purpose });
    return null;
  }
}
