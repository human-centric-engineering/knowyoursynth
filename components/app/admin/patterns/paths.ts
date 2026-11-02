/**
 * The pattern library admin's URLs and names (`f-pattern-library` t-126), under the Synths admin section. Shared by the
 * server pages and the client components, so it holds no component.
 */
import type { PatternOrigin, PatternRightsRisk, PatternStatus } from '@prisma/client';

export const PATTERNS_ADMIN_ROOT = '/admin/synths/patterns';

/** What the list is filtered by: the query string the page and `GET /api/v1/admin/library-patterns` both read. */
export interface PatternFilters {
  q?: string;
  synth?: string;
  role?: string;
  artist?: string;
  fidelity?: string;
  origin?: string;
  rights?: string;
  status?: string;
  page?: number;
}

/** The filters a list can have, in the order the form shows them. */
export const FILTER_KEYS = [
  'q',
  'synth',
  'role',
  'artist',
  'fidelity',
  'origin',
  'rights',
  'status',
] as const;

/** The query string for `filters`, empty values left out, page 1 left out. */
export function filterQuery(filters: PatternFilters): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const v = filters[key];
    if (v) params.set(key, v);
  }
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** The list, filtered; one pattern's editor; or a sound's patterns, in order. */
export const patternListPath = (filters: PatternFilters = {}): string =>
  `${PATTERNS_ADMIN_ROOT}${filterQuery(filters)}`;
export const patternAdminPath = (id: string): string =>
  `${PATTERNS_ADMIN_ROOT}/${encodeURIComponent(id)}`;
export const soundPatternsPath = (synthId: string, slug: string): string =>
  `${PATTERNS_ADMIN_ROOT}/sounds/${encodeURIComponent(synthId)}/${encodeURIComponent(slug)}`;

/** Each origin's label (`pattern-library.md`, Origin). */
export const ORIGIN_LABELS: Record<PatternOrigin, string> = {
  ai_generated: 'AI-generated',
  human_authored: 'Human-authored',
  user_contributed: 'User-contributed',
};

/** Each rights risk's label, and what it means (`pattern-library.md`, Rights risk). */
export const RIGHTS_LABELS: Record<PatternRightsRisk, { label: string; means: string }> = {
  none: { label: 'None', means: 'Nothing in it is taken from a specific work.' },
  needs_review: {
    label: 'Needs review',
    means: 'It recreates a specific part, and no one has checked it yet.',
  },
  cleared: { label: 'Cleared', means: 'Checked against the rights rule, and it fits.' },
  blocked: {
    label: 'Blocked',
    means: 'It must not be shown. A blocked pattern is always disabled.',
  },
};

/** Each status's label (`pattern-library.md`, Status). */
export const STATUS_LABELS: Record<PatternStatus, string> = {
  enabled: 'Enabled',
  disabled: 'Disabled',
};
