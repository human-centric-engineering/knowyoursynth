/**
 * The social card's layout (`f-sharing` h2, t-50), rendered as `next/og` would be handed it:
 *
 * - with a panel, the picture is drawn at the size it was rasterised, under the synth, the brand, the sound's name
 *   and the byline, in the synth's own colours;
 * - a long name gives way, with an ellipsis, and the byline never does;
 * - without a panel, the text card: no picture at all.
 *
 * Which synths get which card, and the 404s, are `shared-sound-page.test.tsx`'s.
 *
 * @see components/app/sharing/social-card.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SocialCard } from '@/components/app/sharing/social-card';
import type { SocialCardInput } from '@/components/app/sharing/social-card';
import { getSynthDef } from '@/lib/app/synths/defs';

const theme = getSynthDef('model-d')!.theme;
const panel = { src: 'data:image/png;base64,UE5H', width: 1104, height: 395 };

const card = (over: Partial<SocialCardInput> = {}) =>
  renderToStaticMarkup(
    <SocialCard
      name="Glass pluck"
      synthName="Model D"
      maker="Behringer"
      author="patchwork"
      theme={theme}
      brand="Know Your Synth"
      panel={panel}
      {...over}
    />
  );

describe('SocialCard with a panel', () => {
  it('draws the picture at the size it was drawn, under the synth, the brand, the name and the byline', () => {
    const out = card();
    expect(out).toContain(`<img src="${panel.src}" width="1104" height="395" alt=""/>`);
    expect(out).toContain('Behringer Model D');
    expect(out).toContain('Know Your Synth');
    expect(out).toContain('Glass pluck');
    expect(out).toContain('@patchwork');
    expect(out.indexOf('Glass pluck')).toBeLessThan(out.indexOf('<img'));
  });

  it('is in the synth’s own colours', () => {
    const out = card();
    expect(out).toContain(theme.panel);
    expect(out).toContain(theme.panel2);
    expect(out).toContain(theme.ink);
  });

  it('lets a long name give way, with an ellipsis, and never the byline', () => {
    const out = card({ name: 'A very long name indeed', author: 'abcdefghijklmnopqrstuvwx' });
    const name = /<div style="([^"]*)">A very long name indeed<\/div>/.exec(out)?.[1];
    const byline = /<div style="([^"]*)">@abcdefghijklmnopqrstuvwx<\/div>/.exec(out)?.[1];
    expect(name).toContain('text-overflow:ellipsis');
    expect(name).toContain('flex-shrink:1');
    expect(name).toContain('min-width:0');
    expect(byline).toContain('flex-shrink:0');
    expect(card({ author: null })).not.toContain('@');
  });
});

describe('SocialCard without a panel', () => {
  it('is the text card, with no picture', () => {
    for (const none of [null, undefined]) {
      const out = card({ panel: none });
      expect(out).not.toContain('<img');
      expect(out).toContain('Glass pluck');
      expect(out).toContain('@patchwork');
    }
  });
});
