'use client';

/**
 * The links admin's two actions on a link, shared by the list page and the owner panels (`f-videos-and-links` t-181):
 * add or edit it in a dialog, and remove it after a confirmation (`DELETE /api/v1/admin/links/:id`).
 */

import { useState, type ReactNode } from 'react';

import { LINKS_API, type AdminLinkView } from '@/components/app/admin/links/data';
import { LinkForm } from '@/components/app/admin/links/link-form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { APIClientError, apiClient } from '@/lib/api/client';
import type { OwnerRef } from '@/lib/app/links/owner';

export interface LinkDialogProps {
  /** The link to edit; null to add one. */
  link: AdminLinkView | null;
  owner?: OwnerRef;
  defaultOurs?: boolean;
  trigger: ReactNode;
  onSaved: (link: AdminLinkView) => void;
}

export function LinkDialog({ link, owner, defaultOurs, trigger, onSaved }: LinkDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{link ? 'Edit link' : 'Add a link'}</DialogTitle>
          <DialogDescription>
            {link
              ? 'Change its address, title, kind, rating or whether it is ours.'
              : 'Paste an address and press Read, then confirm what it found.'}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <LinkForm
            link={link}
            owner={owner}
            defaultOurs={defaultOurs}
            onCancel={() => setOpen(false)}
            onSaved={(saved) => {
              setOpen(false);
              onSaved(saved);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export interface RemoveLinkButtonProps {
  link: AdminLinkView;
  disabled?: boolean;
  onRemoved: (link: AdminLinkView) => void;
  onError: (message: string) => void;
}

export function RemoveLinkButton({ link, disabled, onRemoved, onError }: RemoveLinkButtonProps) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await apiClient.delete(`${LINKS_API}/${encodeURIComponent(link.id)}`);
      onRemoved(link);
    } catch (error) {
      onError(error instanceof APIClientError ? error.message : 'It could not be removed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || busy}
          aria-label={`Remove ${link.title}`}
        >
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this link?</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{link.title}&quot; will no longer show on {link.owner.name}. This can&apos;t be
            undone, but it is in the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void remove()}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
