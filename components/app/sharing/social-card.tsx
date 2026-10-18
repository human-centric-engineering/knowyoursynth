import type { Theme } from '@/lib/app/synths/contract';

/**
 * A shared sound's social card (`f-sharing` h2, owner ruling): its name, the synth, and `@username` as the byline rule
 * allows, in the synth's own faceplate colours (`SynthDef.theme`: `panel` to `panel2` behind, `ink` for the lettering),
 * never fixed ones.
 *
 * With `panel` (t-50), the card shows the sound itself: the faceplate with this sound's values and cables
 * (`panel-image.tsx`), under a single line of name and byline. Without it, as when the picture could not be drawn, the
 * text card.
 *
 * Plain JSX for `next/og`'s `ImageResponse`, which lays out flexbox only: every element with more than one child says
 * `display: flex`.
 */

export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 } as const;

/** The box the panel picture is fitted into on the card: the card less its padding and the line of text above. */
export const SOCIAL_CARD_PANEL_BOX = { width: 1104, height: 408 } as const;

/** A picture of the panel, as `next/og` takes an image: a `data:` URL and the size it was drawn at. */
export interface SocialCardPanel {
  src: string;
  width: number;
  height: number;
}

export interface SocialCardInput {
  name: string;
  synthName: string;
  maker: string;
  /** Null when the byline rule shows none. */
  author: string | null;
  theme: Pick<Theme, 'panel' | 'panel2' | 'ink'>;
  brand: string;
  /** The sound's panel; null for the text card. */
  panel?: SocialCardPanel | null;
}

export function SocialCard({
  name,
  synthName,
  maker,
  author,
  theme,
  brand,
  panel,
}: SocialCardInput) {
  if (panel) return <PanelCard {...{ name, synthName, maker, author, theme, brand, panel }} />;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: `linear-gradient(180deg, ${theme.panel} 0%, ${theme.panel2} 100%)`,
        color: theme.ink,
      }}
    >
      <div style={{ display: 'flex', fontSize: 30, letterSpacing: 4, textTransform: 'uppercase' }}>
        {`${maker} ${synthName}`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>
          {name}
        </div>
        {author && (
          <div style={{ display: 'flex', fontSize: 40, marginTop: 20 }}>{`@${author}`}</div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 26,
          borderTop: `2px solid ${theme.ink}`,
          paddingTop: 20,
        }}
      >
        {brand}
      </div>
    </div>
  );
}

/** The card with the panel: the synth and the brand on one line, the name and byline on the next, then the panel. */
function PanelCard({
  name,
  synthName,
  maker,
  author,
  theme,
  brand,
  panel,
}: SocialCardInput & { panel: SocialCardPanel }) {
  const line = { display: 'flex', whiteSpace: 'nowrap', overflow: 'hidden' } as const;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '36px 48px 48px',
        background: `linear-gradient(180deg, ${theme.panel} 0%, ${theme.panel2} 100%)`,
        color: theme.ink,
      }}
    >
      <div
        style={{
          ...line,
          justifyContent: 'space-between',
          fontSize: 22,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}
      >
        <div style={{ display: 'flex' }}>{`${maker} ${synthName}`}</div>
        <div style={{ display: 'flex' }}>{brand}</div>
      </div>
      <div style={{ ...line, alignItems: 'baseline', marginTop: 10 }}>
        <div
          style={{
            display: 'block',
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: author ? 820 : 1104,
          }}
        >
          {name}
        </div>
        {author && (
          <div style={{ display: 'flex', fontSize: 32, marginLeft: 20 }}>{`@${author}`}</div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 16,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og draws plain <img> */}
        <img src={panel.src} width={panel.width} height={panel.height} alt="" />
      </div>
    </div>
  );
}
