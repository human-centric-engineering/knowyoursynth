'use client';

/**
 * LinkCard — one video, recording or web page about a synth (`f-videos-and-links` t-182).
 *
 * Click to embed: until it is pressed, a card that plays is its picture and title only, so no player, script or
 * cookie of the provider's loads. Pressed, it loads the player from `embedUrl`, the address the server built from the
 * link's provider and id (never the stored URL; see `.context/app/links.md`). A link that does not embed (`other`, or
 * a Bandcamp one whose id has not been read) opens in a new tab instead.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ExternalLink, Play } from 'lucide-react';

import {
  KIND_LABEL,
  PROVIDER_NAME,
  playingUrl,
  viewsLabel,
  type PublicLinkView,
} from '@/components/app/links/data';

/** How tall each player is: the video players at 16:9, the audio ones at the height they draw. */
const PLAYER_BOX: Record<PublicLinkView['provider'], string> = {
  youtube: 'aspect-video',
  vimeo: 'aspect-video',
  spotify: 'h-[152px]',
  soundcloud: 'h-[166px]',
  bandcamp: 'aspect-[350/470]',
  other: 'aspect-video',
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function Picture({ link }: { link: PublicLinkView }) {
  return link.thumbnailUrl ? (
    // A provider's picture, at its own address: `next/image` would fetch it through this server for nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={link.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className="kys-link-blank">{PROVIDER_NAME[link.provider]}</span>
  );
}

/** The kind on its plate in the monitor's corner. */
function Plate({ link }: { link: PublicLinkView }) {
  return (
    <span className="kys-link-plate">
      <span className="kys-led" aria-hidden="true" />
      {KIND_LABEL[link.kind]}
    </span>
  );
}

/** Ours and the view count, in the row under the title. */
function Meta({ link }: { link: PublicLinkView }) {
  const views = viewsLabel(link.views);
  return (
    <>
      {link.ours && <span className="kys-link-ours">Know Your Synth</span>}
      {views && <span>· {views}</span>}
    </>
  );
}

export function LinkCard({ link, index = 0 }: { link: PublicLinkView; index?: number }) {
  const [playing, setPlaying] = useState(false);
  const player = useRef<HTMLIFrameElement>(null);
  const embed = link.embedUrl;
  // Its turn in the list's opening, read by `.kys-link-card`'s animation.
  const turn: CSSProperties & Record<'--i', number> = { '--i': index };

  // The pressed button is gone once the player loads: focus moves to the player rather than falling to the page.
  useEffect(() => {
    if (playing) player.current?.focus();
  }, [playing]);

  if (!embed) {
    return (
      <li className="kys-link-card" style={turn}>
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="kys-link-shot">
          <span className={`kys-link-screen aspect-video ${link.thumbnailUrl ? 'is-picture' : ''}`}>
            <Picture link={link} />
            <Plate link={link} />
            <span className="kys-link-bug">
              {hostOf(link.url)}
              <ExternalLink size={10} aria-hidden="true" />
            </span>
          </span>
          <span className="kys-link-title line-clamp-2 block">{link.title}</span>
        </a>
        <p className="kys-link-meta">
          <Meta link={link} />
          <span className="text-(--kys-faint)">Opens {hostOf(link.url)} in a new tab</span>
        </p>
      </li>
    );
  }

  return (
    <li className="kys-link-card" style={turn}>
      {playing ? (
        <div className={`kys-link-screen is-on ${PLAYER_BOX[link.provider]}`}>
          <iframe
            ref={player}
            src={playingUrl(link.provider, embed)}
            title={link.title}
            className="h-full w-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play ${link.title} (loads ${PROVIDER_NAME[link.provider]}'s player)`}
          className="kys-link-shot"
        >
          <span className={`kys-link-screen aspect-video ${link.thumbnailUrl ? 'is-picture' : ''}`}>
            <Picture link={link} />
            <Plate link={link} />
            <span className="kys-link-play">
              <span>
                <Play size={22} aria-hidden="true" className="translate-x-px" fill="currentColor" />
              </span>
            </span>
            <span className="kys-link-bug">{PROVIDER_NAME[link.provider]}</span>
          </span>
        </button>
      )}
      <p className="kys-link-title line-clamp-2" title={link.title}>
        {link.title}
      </p>
      <div className="kys-link-meta">
        {/* The player covers the plate, so its kind comes down here, the LED lit: it is on. */}
        {playing && (
          <span className="inline-flex items-center gap-1.5 text-(--kys-text)">
            <span className="kys-led is-lit" aria-hidden="true" />
            {KIND_LABEL[link.kind]}
          </span>
        )}
        <Meta link={link} />
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="kys-link-out">
          On {PROVIDER_NAME[link.provider]}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      </div>
    </li>
  );
}
