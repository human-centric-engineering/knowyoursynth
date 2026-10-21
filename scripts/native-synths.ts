/**
 * The synths written straight into the app, with no prototype version (`f-donner-b1`). Every other synth was built in
 * `prototype/` and ported (D3), so the dev-only tools hold it to the prototype: its check baseline and its goldens are
 * the prototype's. A synth here has no prototype to hold it to, so both are recorded once from its own definition, and
 * from then on the definition must keep matching them, under the same "never re-record to make it pass" rule.
 *
 * An explicit list, not "every registered synth the prototype lacks": a mistyped id in a registry would otherwise pass
 * as a new synth with goldens recorded from whatever it happens to do, where today it is refused as an orphan.
 *
 * Adding a synth: [`.context/app/adding-a-synth.md`](../.context/app/adding-a-synth.md).
 */
export const NATIVE_SYNTHS: readonly string[] = ['donner-b1'];

export const isNativeSynth = (id: string): boolean => NATIVE_SYNTHS.includes(id);

/**
 * What is wrong with the list against the registry and the prototype: a native id that is not registered (a typo, or a
 * synth removed without its line here), and one the prototype has too (it is ported, so the prototype is its spec).
 */
export function nativeSynthProblems(registered: string[], prototype: string[]): string[] {
  const reg = new Set(registered);
  const proto = new Set(prototype);
  return NATIVE_SYNTHS.flatMap((id) => [
    ...(reg.has(id) ? [] : [`native synth ${id} is not registered`]),
    ...(proto.has(id)
      ? [`native synth ${id} has a prototype definition: it is ported, not native`]
      : []),
  ]);
}

/**
 * Why `check:synths --write-baseline` must not run, or `null` when it may. It records a native synth's first baseline
 * and nothing else: a ported synth's baseline is the prototype's rendering, which the port has to reproduce, and a
 * recorded baseline is never rewritten, so a sound that moved cannot be made to pass by recording it again.
 */
export function writeBaselineRefusal(run: {
  compare: boolean;
  synth: string | null;
  soundFilter: string | undefined;
  baselineExists: boolean;
}): string | null {
  if (run.compare) return 'use --write-baseline or --compare, not both';
  if (!run.synth) return '--write-baseline records one native synth: name it';
  if (!isNativeSynth(run.synth))
    return `${run.synth} is ported: its baseline is the prototype's (node check.mjs --write-baseline, in prototype/)`;
  if (run.soundFilter) return '--write-baseline writes whole synths – drop the sound filter';
  if (run.baselineExists)
    return `${run.synth} already has a baseline. A sound that differs from it is the sound's to fix; delete the file only if the sounds are meant to change`;
  return null;
}
