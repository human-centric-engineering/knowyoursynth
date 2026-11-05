'use client';

/**
 * LinkCard — one video, recording or web page about a synth (`f-videos-and-links` t-182).
 *
 * Click to embed: until it is pressed, a card that plays is its picture and title only, so no player, script or
 * cookie of the provider's loads. Pressed, it loads the player from `embedUrl`, the address the server built from the
 * link's provider and id (never the stored URL; see `.context/app/links.md`). A link that does not embed (`other`, or
 * a Bandcamp one whose id has not been read) opens in a new tab instead.
 */

import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';

import {
  KIND_LABEL,
  PROVIDER_NAME,
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
    <img
      src={link.thumbnailUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="kys-label flex h-full w-full items-center justify-center text-(--kys-faint)">
      {PROVIDER_NAME[link.provider]}
    </span>
  );
}

function Meta({ link }: { link: PublicLinkView }) {
  const views = viewsLabel(link.views);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--kys-muted)">
      {link.ours && (
        <span className="rounded border border-(--kys-accent) px-1.5 py-0.5 font-semibold text-(--kys-accent)">
          Know Your Synth
        </span>
      )}
      <span>{KIND_LABEL[link.kind]}</span>
      {views && <span>· {views}</span>}
    </p>
  );
}

export function LinkCard({ link }: { link: PublicLinkView }) {
  const [playing, setPlaying] = useState(false);
  const embed = link.embedUrl;

  if (!embed) {
    return (
      <li className="min-w-0">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-(--kys-accent)"
        >
          <span className="relative block aspect-video overflow-hidden rounded-lg border border-(--kys-line) bg-(--kys-surface)">
            <Picture link={link} />
          </span>
          <span className="mt-2 line-clamp-2 block text-sm font-semibold group-hover:text-(--kys-accent)">
            {link.title}
          </span>
        </a>
        <Meta link={link} />
        <p className="mt-0.5 flex items-center gap-1 text-xs text-(--kys-faint)">
          <ExternalLink size={12} aria-hidden="true" />
          Opens {hostOf(link.url)} in a new tab
        </p>
      </li>
    );
  }

  return (
    <li className="min-w-0">
      {playing ? (
        <div
          className={`overflow-hidden rounded-lg border border-(--kys-line) bg-(--kys-surface) ${PLAYER_BOX[link.provider]}`}
        >
          <iframe
            src={embed}
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
          className="group relative block aspect-video w-full overflow-hidden rounded-lg border border-(--kys-line) bg-(--kys-surface) focus-visible:outline-2 focus-visible:outline-(--kys-accent)"
        >
          <Picture link={link} />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 text-white transition-transform group-hover:scale-110">
              <Play size={22} aria-hidden="true" className="translate-x-px" />
            </span>
          </span>
        </button>
      )}
      <p className="mt-2 line-clamp-2 text-sm font-semibold" title={link.title}>
        {link.title}
      </p>
      <Meta link={link} />
      <p className="mt-0.5 text-xs">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-(--kys-faint) hover:text-(--kys-accent) hover:underline"
        >
          On {PROVIDER_NAME[link.provider]}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </p>
    </li>
  );
}
