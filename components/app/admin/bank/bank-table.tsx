'use client';

/**
 * BankTable — one kind of databank row, as an admin finds one to edit (`f-databank` t-36).
 *
 * Renders `GET /api/v1/admin/bank/[kind]`: the tabs, a filter on name and id, and the rows, each linking to its editor.
 * The filter runs in the browser over the list the page loaded.
 */

import { useState } from 'react';
import Link from 'next/link';

import { useSharedSettingsReadOnly } from '@/components/admin/shared-settings-access';
import { BANK_TABS } from '@/components/app/bank/routes';
import { BANK_SINGULAR, bankAdminPath } from '@/components/app/admin/bank/paths';
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
import type { AdminBankRow } from '@/lib/app/bank/admin';
import type { BankKind } from '@/lib/app/bank/read';

export interface BankTableProps {
  kind: BankKind;
  rows: AdminBankRow[];
}

export function BankTable({ kind, rows }: BankTableProps) {
  const readOnly = useSharedSettingsReadOnly();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.id.includes(q)) : rows;

  return (
    <div className="space-y-4">
      <nav aria-label="Databank kinds" className="flex flex-wrap gap-2">
        {BANK_TABS.map(([tab, label]) => (
          <Button key={tab} asChild size="sm" variant={tab === kind ? 'default' : 'outline'}>
            <Link href={bankAdminPath(tab)} aria-current={tab === kind ? 'page' : undefined}>
              {label}
            </Link>
          </Button>
        ))}
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <Label htmlFor="bank-filter" className="text-xs">
            Find
          </Label>
          <Input
            id="bank-filter"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or id"
            className="w-64"
          />
        </div>
        {readOnly ? (
          <Button size="sm" disabled>
            Add {BANK_SINGULAR[kind]}
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link href={bankAdminPath(kind, 'new')}>Add {BANK_SINGULAR[kind]}</Link>
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {shown.length === rows.length ? `${rows.length}` : `${shown.length} of ${rows.length}`}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Id</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link href={bankAdminPath(kind, r.id)} className="font-medium hover:underline">
                  {r.name}
                </Link>
              </TableCell>
              <TableCell>
                <code className="text-xs">{r.id}</code>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{r.detail}</TableCell>
              <TableCell>
                {r.editedAt ? (
                  <Badge variant="secondary">Edited</Badge>
                ) : (
                  <Badge variant="outline">Seed</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground text-sm">
                {rows.length === 0 ? 'Nothing here yet.' : 'Nothing matches.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
