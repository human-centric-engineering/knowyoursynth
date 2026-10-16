'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { FormError } from '@/components/forms/form-error';
import { Button } from '@/components/ui/button';
import { FieldHelp } from '@/components/ui/field-help';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { APIClientError, apiClient } from '@/lib/api/client';
import { LINK_LABELS, LINK_PLATFORMS, LINK_RULES } from '@/lib/app/profile/links';
import {
  ProfileInputSchema,
  ProfileViewSchema,
  type ProfileView,
} from '@/lib/app/profile/profile-data';
import {
  USERNAME_CHANGE_DAYS,
  USERNAME_HOLD_DAYS,
  USERNAME_RULE,
} from '@/lib/app/profile/username';

type FormInput = z.input<typeof ProfileInputSchema>;
type FormOutput = z.output<typeof ProfileInputSchema>;

const PLACEHOLDERS = {
  youtube: 'https://www.youtube.com/@yourname',
  spotify: 'https://open.spotify.com/artist/…',
  instagram: 'https://www.instagram.com/yourname',
  bandcamp: 'https://yourname.bandcamp.com',
} as const;

const SWITCHES = [
  {
    name: 'public',
    label: 'Public profile',
    help: 'On: anyone can see your page at /u/your-username, signed in or not. Off: that address is "not found", and nothing on this card is shown to anyone.',
  },
  {
    name: 'showOwned',
    label: 'Show synths I own',
    help: 'Whether your public page lists the synths you own. Has no effect while your profile is private.',
  },
  {
    name: 'showWishlist',
    label: 'Show my wishlist',
    help: 'Whether your public page lists the synths you want. Has no effect while your profile is private.',
  },
] as const;

function defaults(profile: ProfileView | null): FormInput {
  return {
    username: profile?.username ?? '',
    links: {
      youtube: profile?.links.youtube ?? '',
      spotify: profile?.links.spotify ?? '',
      instagram: profile?.links.instagram ?? '',
      bandcamp: profile?.links.bandcamp ?? '',
    },
    public: profile?.public ?? false,
    showOwned: profile?.showOwned ?? false,
    showWishlist: profile?.showWishlist ?? false,
  };
}

/**
 * Choose or change a username, set the four links, and say who sees the profile (`f-profiles` r1).
 *
 * The form runs the same `ProfileInputSchema` the API does, so it refuses exactly what the server would, and sends the
 * links already rebuilt. Whether a name is taken, held, or changed too recently is the server's answer, shown under the
 * username.
 */
export function SynthProfileForm({ profile }: { profile: ProfileView | null }) {
  const [saved, setSaved] = useState<ProfileView | null>(profile);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(ProfileInputSchema),
    mode: 'onTouched',
    defaultValues: defaults(profile),
  });

  const onSubmit = async (values: FormOutput) => {
    setServerError(null);
    setDone(false);
    try {
      const answer = ProfileViewSchema.parse(
        await apiClient.put('/api/v1/me/profile', { body: values })
      );
      setSaved(answer);
      reset(defaults(answer));
      setDone(true);
    } catch (error) {
      setServerError(
        error instanceof APIClientError ? error.message : "That didn't save. Try again."
      );
    }
  };

  const nextChange = saved?.nextChangeAt ? saved.nextChangeAt.slice(0, 10) : null;

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="profile-username" className="flex items-center gap-1">
          Username
          <FieldHelp title="Username">
            Your public page is /u/your-username, and it&apos;s the name anything you share later
            goes under. Your account name and email are never public. You can change it once every{' '}
            {USERNAME_CHANGE_DAYS} days, and your old one is held for {USERNAME_HOLD_DAYS} days so
            nobody else can take it.
          </FieldHelp>
        </Label>
        <Input
          id="profile-username"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!errors.username}
          aria-describedby="profile-username-rule"
          {...register('username')}
        />
        <p id="profile-username-rule" className="text-muted-foreground text-sm">
          {USERNAME_RULE}.{nextChange ? ` You can change it again from ${nextChange}.` : null}
        </p>
        <FormError message={errors.username?.message} />
      </div>

      <fieldset className="space-y-4">
        <legend className="mb-2 flex items-center gap-1 text-sm font-medium">
          Links
          <FieldHelp title="Links">
            Where people can hear your music. One link per platform, each to your own page there.
            Shown on your public page when it&apos;s on. Leave a field blank for none.
          </FieldHelp>
        </legend>
        {LINK_PLATFORMS.map((platform) => (
          <div key={platform} className="space-y-2">
            <Label htmlFor={`profile-${platform}`} className="flex items-center gap-1">
              {LINK_LABELS[platform]}
              <FieldHelp title={LINK_LABELS[platform]}>{LINK_RULES[platform]}</FieldHelp>
            </Label>
            <Input
              id={`profile-${platform}`}
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder={PLACEHOLDERS[platform]}
              aria-invalid={!!errors.links?.[platform]}
              {...register(`links.${platform}`)}
            />
            <FormError message={errors.links?.[platform]?.message} />
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-sm font-medium">Who sees it</legend>
        {SWITCHES.map(({ name, label, help }) => (
          <div key={name} className="flex items-center justify-between gap-4">
            <Label htmlFor={`profile-${name}`} className="flex items-center gap-1">
              {label}
              <FieldHelp title={label}>{help}</FieldHelp>
            </Label>
            <Controller
              control={control}
              name={name}
              render={({ field }) => (
                <Switch
                  id={`profile-${name}`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={isSubmitting}
                />
              )}
            />
          </div>
        ))}
      </fieldset>

      {serverError ? <FormError message={serverError} /> : null}
      {done ? (
        <p className="text-sm" role="status">
          Saved.
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {saved ? 'Save profile' : 'Create profile'}
      </Button>
    </form>
  );
}
