// Fitting the sound detector's model to labelled sounds, and measuring how far it agrees with their labels.
//
// The labels are the library's own: each sound's category (its first tag) and the role the default role rule gives
// its riff. `scripts/fit-soundkind.ts` renders the library, fits with this and writes `soundkind-model.ts`; the
// library test measures the written model with `agreement`. Pure and deterministic: the same rows always fit the
// same model, so a refit that changes nothing writes nothing new.
//
// Why a fitted model, and what it gets wrong: .context/app/pattern-library.md (The sound detector).
import type { PatternRole } from '@prisma/client';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-facts';
import { PRESET_CATEGORIES, type PresetCategory } from '@/lib/app/synths/contract';
import {
  KIND_INPUTS,
  kindInputs,
  kindOf,
  type KindModel,
  type SoundFeatures,
} from '@/lib/app/synths/lib/soundkind';

/** One labelled sound: what the library says it is, and what the detector read off it. */
export interface KindRow {
  synth: string;
  id: string;
  category: PresetCategory;
  /** The role the default role rule gives its riff. */
  role: PatternRole;
  features: SoundFeatures;
}

/** How the fit runs. The defaults are what `soundkind-model.ts` was fitted with. */
export interface FitOptions {
  /** Gradient steps over the whole set. */
  steps: number;
  rate: number;
  /** L2 penalty on the weights (not the biases): keeps a rare category's weights from running away. */
  penalty: number;
}
export const FIT_DEFAULTS: FitOptions = { steps: 400, rate: 0.5, penalty: 0.01 };

const round = (x: number, places: number): number => {
  const k = 10 ** places;
  return Math.round(x * k) / k || 0; // `|| 0`: no −0 in the written file
};

/** A value for every category, by its index in PRESET_CATEGORIES. */
function byCategory<T>(value: (k: number) => T): Record<PresetCategory, T> {
  return Object.fromEntries(PRESET_CATEGORIES.map((c, k) => [c, value(k)])) as Record<
    PresetCategory,
    T
  >;
}

/** A value for every pattern role. */
function byRole<T>(value: (r: PatternRole) => T): Record<PatternRole, T> {
  return Object.fromEntries(PATTERN_ROLES.map((r) => [r, value(r)])) as Record<PatternRole, T>;
}

/** Fit the model: standardise the inputs, then a multinomial logistic regression by full-batch gradient descent. */
export function fitKindModel(rows: KindRow[], opts: FitOptions = FIT_DEFAULTS): KindModel {
  const heard = rows.filter((r) => !r.features.silent);
  if (!heard.length) throw new Error('fitKindModel: no sound to fit to');
  const X = heard.map((r) => kindInputs(r.features));
  const D = KIND_INPUTS.length;
  const K = PRESET_CATEGORIES.length;
  const y = heard.map((r) => PRESET_CATEGORIES.indexOf(r.category));

  // Rounded as the model file writes them, so the weights are fitted to exactly the standardisation it will use.
  // An input with no spread (every row the same, give or take float dust) is left unscaled rather than divided by ~0.
  const mean = Array.from({ length: D }, (_, j) =>
    round(X.reduce((s, x) => s + x[j], 0) / X.length, 4)
  );
  const scale = Array.from({ length: D }, (_, j) => {
    const sd = Math.sqrt(X.reduce((s, x) => s + (x[j] - mean[j]) ** 2, 0) / X.length);
    return sd > 1e-3 ? round(sd, 4) : 1;
  });
  const Z = X.map((x) => [...x.map((v, j) => (v - mean[j]) / scale[j]), 1]);

  const W = Array.from({ length: K }, () => new Array<number>(D + 1).fill(0));
  const G = Array.from({ length: K }, () => new Array<number>(D + 1).fill(0));
  const s = new Array<number>(K);
  for (let step = 0; step < opts.steps; step++) {
    for (const g of G) g.fill(0);
    for (let i = 0; i < Z.length; i++) {
      const z = Z[i];
      let max = -Infinity;
      for (let k = 0; k < K; k++) {
        let v = 0;
        for (let j = 0; j <= D; j++) v += W[k][j] * z[j];
        s[k] = v;
        if (v > max) max = v;
      }
      let sum = 0;
      for (let k = 0; k < K; k++) {
        s[k] = Math.exp(s[k] - max);
        sum += s[k];
      }
      for (let k = 0; k < K; k++) {
        const g = s[k] / sum - (y[i] === k ? 1 : 0);
        for (let j = 0; j <= D; j++) G[k][j] += g * z[j];
      }
    }
    for (let k = 0; k < K; k++)
      for (let j = 0; j <= D; j++)
        W[k][j] -= opts.rate * (G[k][j] / Z.length + (j < D ? opts.penalty * W[k][j] : 0));
  }

  // How often each category's sounds carry each role, from every row (a silent sound's riff still has a role).
  const roles = byCategory((k) => {
    const mine = rows.filter((r) => r.category === PRESET_CATEGORIES[k]);
    return byRole((r) =>
      mine.length ? round(mine.filter((m) => m.role === r).length / mine.length, 3) : 0
    );
  });

  return {
    inputs: [...KIND_INPUTS],
    mean,
    scale,
    weights: byCategory((k) => W[k].map((v) => round(v, 4))),
    roles,
  };
}

/** What the detector made of the rows: how many it agrees with, and the confusion table (label → what it read). */
export interface Agreement {
  agree: number;
  total: number;
  /** label → detected category (or `silent`) → count. */
  table: Record<PresetCategory, Record<PresetCategory | 'silent', number>>;
}

export function agreement(rows: KindRow[], model: KindModel): Agreement {
  const table = Object.fromEntries(
    PRESET_CATEGORIES.map((c) => [
      c,
      Object.fromEntries([...PRESET_CATEGORIES, 'silent'].map((d) => [d, 0])),
    ])
  ) as Agreement['table'];
  let agree = 0;
  for (const r of rows) {
    const got = kindOf(r.features, model)?.category ?? 'silent';
    table[r.category][got]++;
    if (got === r.category) agree++;
  }
  return { agree, total: rows.length, table };
}

/** A fixed fold for a sound, from its name, so cross-validation splits the same way every run. */
function foldOf(row: KindRow, folds: number): number {
  let h = 2166136261;
  for (const ch of `${row.synth}/${row.id}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % folds;
}

/** Agreement on sounds the model was not fitted to: fit on all folds but one, measure on that one, every way round. */
export function crossValidate(
  rows: KindRow[],
  folds = 5,
  opts: FitOptions = FIT_DEFAULTS
): { agree: number; total: number } {
  let agree = 0;
  for (let f = 0; f < folds; f++) {
    const model = fitKindModel(
      rows.filter((r) => foldOf(r, folds) !== f),
      opts
    );
    agree += agreement(
      rows.filter((r) => foldOf(r, folds) === f),
      model
    ).agree;
  }
  return { agree, total: rows.length };
}

/** The confusion table as Markdown, for the doc: one row per label, the detected categories across. */
export function confusionMarkdown(a: Agreement): string {
  const cols = [...PRESET_CATEGORIES, 'silent'] as const;
  const used = cols.filter((c) => PRESET_CATEGORIES.some((r) => a.table[r][c] > 0));
  const head = `| Label | ${used.join(' | ')} | Agree |`;
  const rule = `| --- | ${used.map(() => '---:').join(' | ')} | ---: |`;
  const lines = PRESET_CATEGORIES.map((r) => {
    const n = cols.reduce((s, c) => s + a.table[r][c], 0);
    const cells = used.map((c) =>
      c === r ? `**${a.table[r][c]}**` : String(a.table[r][c] || '·')
    );
    return `| ${r} | ${cells.join(' | ')} | ${n ? Math.round((100 * a.table[r][r]) / n) : 0}% |`;
  });
  return [head, rule, ...lines].join('\n');
}
