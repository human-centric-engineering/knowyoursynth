import type { Theme } from '@/lib/app/synths/contract';

/**
 * A shared sound's social card (`f-sharing` h2, owner ruling): its name, the synth, and `@username` as the byline rule
 * allows, in the synth's own faceplate colours (`SynthDef.theme`: `panel` to `panel2` behind, `ink` for the lettering),
 * never fixed ones. A picture of the panel itself is h5 (t-50).
 *
 * Plain JSX for `next/og`'s `ImageResponse`, which lays out flexbox only: every element with more than one child says
 * `display: flex`.
 */

export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 } as const;

export interface SocialCardInput {
  name: string;
  synthName: string;
  maker: string;
  /** Null when the byline rule shows none. */
  author: string | null;
  theme: Pick<Theme, 'panel' | 'panel2' | 'ink'>;
  brand: string;
}

export function SocialCard({ name, synthName, maker, author, theme, brand }: SocialCardInput) {
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
