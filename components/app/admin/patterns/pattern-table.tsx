/**
 * PatternTable — the pattern library, as an admin finds a pattern to edit (`f-pattern-library` t-126).
 *
 * Renders one page of `GET /api/v1/admin/library-patterns`: the filters, the rows, each linking to its editor, and the
 * pager. The filters are a plain GET form, so the server does the filtering over the whole library and a filtered list
 * is a link an admin can share. No state, so it renders on the server. Each row's rights risk and status show, and
 * its checkbox is read by the bulk bar above it (t-156), the one client part.
 */

import Link from 'next/link';

import { PATTERN_PICK, PatternBulkBar } from '@/components/app/admin/patterns/pattern-bulk-bar';
import {
  FILTER_KEYS,
  ORIGIN_LABELS,
  PATTERNS_ADMIN_ROOT,
  patternAdminPath,
  patternListPath,
  RIGHTS_LABELS,
  STATUS_LABELS,
  type PatternFilters,
} from '@/components/app/admin/patterns/paths';
import { FieldHelp } from '@/components/ui/field-help';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FIDELITY_LABELS, ROLE_LABELS } from '@/lib/app/patterns/library-labels';
import { PATTERN_ROLES } from '@/lib/app/patterns/library-roles';
// Types only: the read layer holds the database client.
import type { AdminLibraryRow, LibraryPatternChoices } from '@/lib/app/patterns/library-edit';

const SELECT = 'border-input bg-background h-9 rounded-md border px-3 text-sm';

export interface PatternTableProps {
  rows: AdminLibraryRow[];
  total: number;
  page: number;
  limit: number;
  filters: PatternFilters;
  choices: Pick<LibraryPatternChoices, 'synths' | 'artists'>;
}

export function PatternTable({ rows, total, page, limit, filters, choices }: PatternTableProps) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const filtered = FILTER_KEYS.some((k) => filters[k]);
  const first = total === 0 ? 0 : (page - 1) * limit + 1;

  return (
    <div className="space-y-4">
      <form
        method="get"
        action={PATTERNS_ADMIN_ROOT}
        aria-label="Filter patterns"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="grid gap-1">
          <Label htmlFor="pattern-q" className="text-xs">
            Find
          </Label>
          <Input
            id="pattern-q"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="Name or Inspired by"
            className="w-56"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pattern-synth" className="text-xs">
            Synth
          </Label>
          <select
            id="pattern-synth"
            name="synth"
            defaultValue={filters.synth ?? ''}
            className={SELECT}
          >
            <option value="">Any</option>
            {choices.synths.map((s) => (
              <option key={s.id} value={s.id}>
                {s.maker} {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pattern-role" className="text-xs">
            Role
          </Label>
          <select
            id="pattern-role"
            name="role"
            defaultValue={filters.role ?? ''}
            className={SELECT}
          >
            <option value="">Any</option>
            {PATTERN_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pattern-artist" className="text-xs">
            Artist
          </Label>
          <select
            id="pattern-artist"
            name="artist"
            defaultValue={filters.artist ?? ''}
            className={`${SELECT} max-w-56`}
          >
            <option value="">Any</option>
            {choices.artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="pattern-fidelity" className="text-xs">
            Fidelity
          </Label>
          <select
            id="pattern-fidelity"
            name="fidelity"
            defaultValue={filters.fidelity ?? ''}
            className={SELECT}
          >
            <option value="">Any</option>
            {Object.entries(FIDELITY_LABELS).map(([f, { label }]) => (
              <option key={f} value={f}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {(
          [
            ['origin', 'Origin', ORIGIN_LABELS],
            [
              'rights',
              'Rights risk',
              Object.fromEntries(Object.entries(RIGHTS_LABELS).map(([k, v]) => [k, v.label])),
            ],
            ['status', 'Status', STATUS_LABELS],
          ] as const
        ).map(([key, label, options]) => (
          <div key={key} className="grid gap-1">
            <Label htmlFor={`pattern-${key}`} className="text-xs">
              {label}
            </Label>
            <select
              id={`pattern-${key}`}
              name={key}
              defaultValue={filters[key] ?? ''}
              className={SELECT}
            >
              <option value="">Any</option>
              {Object.entries(options).map(([v, text]) => (
                <option key={v} value={v}>
                  {text}
                </option>
              ))}
            </select>
          </div>
        ))}
        <Button type="submit" size="sm">
          Filter
        </Button>
        {filtered && (
          <Button asChild size="sm" variant="ghost">
            <Link href={PATTERNS_ADMIN_ROOT}>Clear</Link>
          </Button>
        )}
      </form>

      <PatternBulkBar />

      <p className="text-muted-foreground text-xs">
        {total === 0
          ? 'No patterns'
          : rows.length === 0
            ? `None on page ${page} of ${pages} — ${total} in all`
            : `${first}–${first + rows.length - 1} of ${total}`}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <span className="sr-only">Choose</span>
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Inspired by</TableHead>
            <TableHead>Fidelity</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>
              Rights risk{' '}
              <FieldHelp title="Rights risk" ariaLabel="About the rights risk column">
                <ul className="list-disc space-y-1 pl-4">
                  {Object.values(RIGHTS_LABELS).map((r) => (
                    <li key={r.label}>
                      <strong>{r.label}</strong>: {r.means}
                    </li>
                  ))}
                </ul>
              </FieldHelp>
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Patches</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <input
                  type="checkbox"
                  name={PATTERN_PICK}
                  value={r.id}
                  aria-label={`Choose ${r.name}`}
                />
              </TableCell>
              <TableCell>
                <Link href={patternAdminPath(r.id)} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </TableCell>
              {'problem' in r ? (
                <TableCell colSpan={8} className="text-destructive text-sm">
                  {r.problem}
                </TableCell>
              ) : (
                <>
                  <TableCell className="text-sm">{ROLE_LABELS[r.role]}</TableCell>
                  <TableCell className="text-sm">{r.inspiredBy.label}</TableCell>
                  <TableCell className="text-sm">{FIDELITY_LABELS[r.fidelity].label}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {ORIGIN_LABELS[r.origin]}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.rightsRisk === 'blocked'
                          ? 'destructive'
                          : r.rightsRisk === 'needs_review'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {RIGHTS_LABELS[r.rightsRisk].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.status === 'disabled' ? (
                      <Badge variant="outline">Disabled</Badge>
                    ) : (
                      <span className="text-muted-foreground">Enabled</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {soundsLine(r.sounds)}
                  </TableCell>
                  <TableCell>
                    {r.editedAt ? (
                      <Badge variant="secondary">Edited</Badge>
                    ) : (
                      <Badge variant="outline">Seed</Badge>
                    )}
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-muted-foreground text-sm">
                {total > 0
                  ? 'This page is past the end of the list.'
                  : filtered
                    ? 'Nothing matches.'
                    : 'The library is empty.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={patternListPath({ ...filters, page: page - 1 })}>Previous</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Previous
            </Button>
          )}
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Button asChild size="sm" variant="outline">
              <Link href={patternListPath({ ...filters, page: page + 1 })}>Next</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Next
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}

/** How many patches list a pattern, and how many play it by default. */
function soundsLine(sounds: { isDefault: boolean }[]): string {
  if (sounds.length === 0) return 'None';
  const defaults = sounds.filter((s) => s.isDefault).length;
  const on = `${sounds.length} ${sounds.length === 1 ? 'patch' : 'patches'}`;
  return defaults ? `${on}, default of ${defaults}` : on;
}
