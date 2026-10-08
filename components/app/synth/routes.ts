/**
 * The synth page's URLs: the panel view in the query, and the prototype's hash routes.
 *
 * Plan §3 "Prototype state": the URL is the synth, `?view=` is the panel view, and the prototype's hash links
 * (`#<id>`, `#<id>/outline`, `#<id>/long`) redirect to them. The databank's `#bank/…` links are the bank pages' to
 * redirect (`f-databank`), so they are left alone here.
 */

/** How the panel is drawn: ink on paper or the shaded hardware, and the long faceplate or the modular case. */
export interface PanelView {
  outline: boolean;
  long: boolean;
}

export const DEFAULT_VIEW: PanelView = { outline: false, long: false };

/** `?view=outline`, `?view=long` or `?view=long,outline` → the view. Unknown words are ignored. */
export function parseView(param: string | null | undefined): PanelView | null {
  if (!param) return null;
  const words = param.split(',');
  return { outline: words.includes('outline'), long: words.includes('long') };
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

/** A prototype hash route → the app URL it now lives at, or `null` (see {@link hashTarget}). */
export function hashRoute(hash: string, isSynth: (id: string) => boolean): string | null {
  const t = hashTarget(hash, isSynth);
  return t && synthHref(t.id, t.view);
}
