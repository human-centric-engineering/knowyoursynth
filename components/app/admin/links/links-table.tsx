'use client';

/**
 * LinksTable — every video and link, as an admin finds one (`f-videos-and-links` t-181).
 *
 * Renders a page of `GET /api/v1/admin/links`, newest edit first. The filters (what it is about, provider, ours) are in
 * the page's address, so the server page reads them and a filtered view can be shared. Each row says what it is about,
 * linking to that thing's editor, and its YouTube counts with when they last changed.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import {
  formatCount,
  LINK_OWNER_KINDS,
  OWNER_LABEL,
  ownerAdminPath,
  PROVIDER_LABEL,
  type AdminLinkView,
} from '@/components/app/admin/links/data';
import { LinkDialog, RemoveLinkButton } from '@/components/app/admin/links/link-dialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ClientDate } from '@/components/ui/client-date';
import { FieldHelp } from '@/components/ui/field-help';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LINK_PROVIDERS } from '@/lib/app/links/providers';

export interface LinkFilters {
  owner: string;
  provider: string;
  ours: string;
}

export interface LinksTableProps {
  links: AdminLinkView[];
  filters: LinkFilters;
  page: number;
  totalPages: number;
  total: number;
}

const FILTERS: { key: keyof LinkFilters; label: string; options: [string, string][] }[] = [
  {
    key: 'owner',
    label: 'About',
    options: LINK_OWNER_KINDS.map((k) => [k, OWNER_LABEL[k]]),
  },
  {
    key: 'provider',
    label: 'Provider',
    options: LINK_PROVIDERS.map((p) => [p, PROVIDER_LABEL[p]]),
  },
  {
    key: 'ours',
    label: 'Ours',
    options: [
      ['true', 'Ours'],
      ['false', 'Not ours'],
    ],
  },
];

export function LinksTable({ links, filters, page, totalPages, total }: LinksTableProps) {
  const readOnly = useSharedSettingsReadOnly();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [problem, setProblem] = useState<string | null>(null);

  const hrefWith = (changes: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const changed = () => {
    setProblem(null);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          {FILTERS.map((f) => (
            <div key={f.key} className="grid gap-1">
              <Label htmlFor={`links-filter-${f.key}`} className="text-xs">
                {f.label}
              </Label>
              <select
                id={`links-filter-${f.key}`}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={filters[f.key]}
                onChange={(e) => router.push(hrefWith({ [f.key]: e.target.value, page: '' }))}
              >
                <option value="">All</option>
                {f.options.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <LinkDialog
          link={null}
          onSaved={changed}
          trigger={
            <Button size="sm" disabled={readOnly}>
              Add link
            </Button>
          }
        />
      </div>

      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}

      <p className="text-muted-foreground text-xs">
        {total} {total === 1 ? 'link' : 'links'}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>About</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead className="text-right">Views</TableHead>
            <TableHead className="text-right">Likes</TableHead>
            <TableHead>
              <span className="inline-flex items-center gap-1">
                Counts read
                <FieldHelp title="Counts read" ariaLabel="About when the counts were read">
                  <p>
                    When YouTube&apos;s view and like counts for it last changed. They are read when
                    a link is added and refreshed daily, and only with a YouTube key. Anything but
                    YouTube has none, and is ordered by its rating instead.
                  </p>
                </FieldHelp>
              </span>
            </TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {links.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="max-w-xs">
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium hover:underline"
                >
                  {l.title}
                </a>
                {l.ours && (
                  <Badge variant="secondary" className="ml-2">
                    Ours
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-sm">
                <span className="text-muted-foreground">{OWNER_LABEL[l.owner.kind]}</span>{' '}
                <Link href={ownerAdminPath(l.owner)} className="hover:underline">
                  {l.owner.name}
                </Link>
              </TableCell>
              <TableCell className="text-sm">{PROVIDER_LABEL[l.provider]}</TableCell>
              <TableCell className="text-sm">{l.kind}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {formatCount(l.views)}
              </TableCell>
              <TableCell className="text-right text-sm tabular-nums">
                {formatCount(l.likes)}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {l.statsAt ? <ClientDate date={l.statsAt} /> : '—'}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap">
                <LinkDialog
                  link={l}
                  onSaved={changed}
                  trigger={
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={readOnly}
                      aria-label={`Edit ${l.title}`}
                    >
                      Edit
                    </Button>
                  }
                />
                <RemoveLinkButton
                  link={l}
                  disabled={readOnly}
                  onRemoved={changed}
                  onError={setProblem}
                />
              </TableCell>
            </TableRow>
          ))}
          {links.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-muted-foreground text-sm">
                {total === 0 && !filters.owner && !filters.provider && !filters.ours
                  ? 'No links yet.'
                  : 'Nothing matches.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-2 text-sm">
          {page > 1 ? (
            <Button asChild size="sm" variant="outline">
              <Link href={hrefWith({ page: String(page - 1) })}>Previous</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              Previous
            </Button>
          )}
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Button asChild size="sm" variant="outline">
              <Link href={hrefWith({ page: String(page + 1) })}>Next</Link>
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
