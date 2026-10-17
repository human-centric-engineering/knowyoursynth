/**
 * The synth page's URLs: the panel view in the query, and the prototype's hash routes.
 *
 * Plan §3 "Prototype state": the URL is the synth, `?view=` is the panel view, and the prototype's hash links
 * (`#<id>`, `#<id>/outline`, `#<id>/long`) redirect to them. The databank's `#bank/…` links redirect to its pages
 * (`components/app/bank/routes.ts`). `?sound=` opens the synth with one of its library sounds loaded, which is how a
 * databank record's "Load a sound in this style" reaches a synth.
 */

import { bankHashRoute } from '@/components/app/bank/routes';

/** How the panel is drawn: ink on paper or the shaded hardware, and the long faceplate or the modular case. */
export interface PanelView {
  outline: boolean;
  long: boolean;
}

export const DEFAULT_VIEW: PanelView = { outline: false, long: false };

/**
 * `?view=outline`, `?view=long` or `?view=long,outline` → the view. Unknown words are ignored, and a param with none
 * that are known is `null`, as if absent: it says nothing, so it must not override the last view chosen.
 */
export function parseView(param: string | null | undefined): PanelView | null {
  if (!param) return null;
  const words = param.split(',');
  const view = { outline: words.includes('outline'), long: words.includes('long') };
  return view.outline || view.long ? view : null;
}

/** The view → its `view` query value, or `null` for the default view (no query at all). */
export function viewQuery(view: PanelView): string | null {
  const words = [view.long && 'long', view.outline && 'outline'].filter(Boolean);
  return words.length ? words.join(',') : null;
}

/** One synth's page, with the view in its query when it is not the default. */
export function synthHref(id: string, view: PanelView = DEFAULT_VIEW): string {
  const q = viewQuery(view);
  return `/synths/${encodeURIComponent(id)}${q ? `?view=${q}` : ''}`;
}

/** A sound someone shared, by its public address (`f-sharing`): the synth's page with it loaded, and the view as above. */
export function sharedSoundHref(id: string, slug: string, view: PanelView = DEFAULT_VIEW): string {
  const q = viewQuery(view);
  return `/synths/${encodeURIComponent(id)}/s/${encodeURIComponent(slug)}${q ? `?view=${q}` : ''}`;
}

/** One synth's page, opening with one of its library sounds loaded. */
export function soundHref(id: string, soundId: string): string {
  return `/synths/${encodeURIComponent(id)}?sound=${encodeURIComponent(soundId)}`;
}

/** One synth's page, opening with one of the user's own sounds (`?mine=`), as the dashboard links to it. */
export function mySoundHref(id: string, soundId: string): string {
  return `/synths/${encodeURIComponent(id)}?mine=${encodeURIComponent(soundId)}`;
}

const SYNTH_HREF = /^\/synths\/[a-z0-9-]{1,64}$/;

/**
 * Settings, at the synth profile, with the way back to the synth page (`f-sharing` h3): where Publish sends someone with
 * no username yet. The profile form offers `back` once a username is saved ({@link backToSound}).
 */
export function chooseUsernameHref(back: string): string {
  return `/settings?back=${encodeURIComponent(back)}#synth-profile`;
}

/**
 * A `back` query → the address to go back to, or `null`. Only a synth page ({@link synthHref}, default view) is taken,
 * so the link cannot be pointed anywhere else. It is the plain page, not `?mine=`, as sign-in's way back is: the panel,
 * with the sound open and anything moved since it was saved, comes back from storage, where `?mine=` would load the
 * saved sound over it.
 */
export function backToSound(param: string | null | undefined): string | null {
  return param && SYNTH_HREF.test(param) ? param : null;
}

/**
 * A prototype hash route → the synth and view it names, or `null` when the hash is not one (or names a synth the app
 * cannot play). `isSynth` says which ids are real.
 */
export function hashTarget(
  hash: string,
  isSynth: (id: string) => boolean
): { id: string; view: PanelView } | null {
  const [id = '', ...rest] = hash.replace(/^#/, '').split('/');
  if (!id || id === 'bank' || !isSynth(id)) return null;
  return { id, view: { outline: rest.includes('outline'), long: rest.includes('long') } };
}

/**
 * A prototype hash route → the app URL it now lives at, or `null`: a databank link's page (`bankHashRoute`), else a
 * synth's (see {@link hashTarget}).
 */
export function hashRoute(hash: string, isSynth: (id: string) => boolean): string | null {
  const bank = bankHashRoute(hash);
  if (bank) return bank;
  const t = hashTarget(hash, isSynth);
  return t && synthHref(t.id, t.view);
}
