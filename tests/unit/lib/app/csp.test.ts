/**
 * The CSP's `frame-src` carries the embed players (`f-videos-and-links` t-182).
 *
 * The real seam, not a mock: the production header has to let the five players load, and nothing else. The filter
 * itself is the platform's (`tests/unit/lib/security/headers-app-frame-src.test.ts`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMBED_ORIGINS } from '@/lib/app/links/providers';

async function loadHeaders() {
  vi.resetModules();
  return import('@/lib/security/headers');
}

describe('frame-src for the embed players', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('carries every embed origin, and only those beside self, in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { getCSP, getCSPConfig } = await loadHeaders();

    expect(getCSPConfig()['frame-src']).toEqual(["'self'", ...EMBED_ORIGINS]);
    expect(getCSP()).toContain(
      "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://open.spotify.com https://bandcamp.com https://w.soundcloud.com"
    );
  });

  it('carries them in development too', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { getCSPConfig } = await loadHeaders();

    expect(getCSPConfig()['frame-src']).toEqual(["'self'", ...EMBED_ORIGINS]);
  });
});
