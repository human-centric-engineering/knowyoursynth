// @vitest-environment node
/**
 * The root layout's no-flash theme script: the server copy runs (no `type`), and the copy React builds on the client
 * is an inert data block (`type="text/plain"`), so React 19 does not warn about a script tag it cannot run.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeScript } from '@/components/app/theme-script';
import { NO_FLASH_THEME_SCRIPT } from '@/lib/theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeScript', () => {
  it('renders a runnable script with the nonce and the theme code on the server', () => {
    const html = renderToStaticMarkup(<ThemeScript nonce="abc123" />);
    expect(html).toContain('nonce="abc123"');
    expect(html).not.toContain('type=');
    expect(html).toContain(NO_FLASH_THEME_SCRIPT);
  });

  it('marks the client-built copy as text/plain so it never runs', () => {
    vi.stubGlobal('window', {});
    const html = renderToStaticMarkup(<ThemeScript nonce="abc123" />);
    expect(html).toContain('type="text/plain"');
    expect(html).toContain(NO_FLASH_THEME_SCRIPT);
  });
});
