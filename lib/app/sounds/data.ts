/**
 * The shapes of a user's sound (`f-my-sounds` s1): what the API takes and what it returns. Shapes only, with no
 * database client, so the synth page (s2) validates with the same schemas the routes do.
 *
 * The panel is checked twice. Here, only that it is a panel at all and not absurdly large; then against the synth's
 * definition by `validateSound` (`lib/app/synths/validate.ts`), in `lib/app/sounds/store.ts`, which needs the synth.
 */
import { z } from 'zod';
import { CablePairSchema, SettingsSchema } from '@/lib/app/synths/validate';
import type { CablePair, ControlValues } from '@/lib/app/synths/contract';

/**
 * More controls and cables than any panel has (the DeepMind has 1,568 controls). They bound what one request can
 * store; the definition decides the rest.
 */
export const MAX_VALUES = 5000;
export const MAX_CABLES = 500;

/** A synth id as the registry writes them (`model-d`, `2-xm`). */
export const SynthIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/, 'Not a synth id');

/** A library sound's slug within its synth (`stacked-night-bass`). */
export const SoundSlugSchema = z.string().regex(/^[a-z0-9-]{1,120}$/, 'Not a library sound id');

/** A user sound's id, as Prisma's `cuid()` writes them. Anything else cannot be one, so it is not looked up. */
export const UserSoundIdSchema = z.string().regex(/^[a-z0-9]{1,40}$/);

/**
 * A shared sound's public address, as `lib/app/sounds/sharing.ts` mints them: ten characters of lower-case Crockford
 * base32 (no i, l, o or u). Anything else cannot be one, so it is not looked up.
 */
export const SharedSlugSchema = z.string().regex(/^[0-9a-hjkmnp-tv-z]{10}$/);

/** Who may open a sound. Only publishing (`POST /api/v1/sounds/:id/publish`) makes one `published`. */
export const SOUND_VISIBILITIES = ['private', 'link', 'published'] as const;
export type SoundVisibility = (typeof SOUND_VISIBILITIES)[number];

/** A library tag as the catalogue writes them (`bass`, `sci-fi`). Whether the synth uses it is checked at publish. */
export const SoundTagSchema = z.string().regex(/^[a-z0-9][a-z0-9 &'-]{0,39}$/, 'Not a tag');
export const MAX_SOUND_TAGS = 3;

/** A sound's name and notes, as the API takes them. Exported so the save dialog checks them the same way. */
export const NameSchema = z.string().trim().min(1, 'Name the sound').max(120);
export const NotesSchema = z.string().trim().max(2000);

/** A panel as the page sends it: control values and the cables in, before they are checked against the synth. */
export const PanelInputSchema = z.object({
  values: SettingsSchema.refine((v) => Object.keys(v).length <= MAX_VALUES, {
    message: `At most ${MAX_VALUES} control values`,
  }),
  cables: z.array(CablePairSchema).max(MAX_CABLES).default([]),
});

/**
 * `POST /api/v1/sounds`. A sound made from scratch sends its panel. A copy of a library sound names it in `source`,
 * which records the credit; with no panel, the copy is the library sound as it ends, every step applied, and with no
 * name it takes the library sound's. A copy of a shared sound names its address, `source: { shared }`; with no panel
 * or name it takes the shared sound's.
 */
export const CreateUserSoundSchema = z
  .object({
    synthId: SynthIdSchema,
    name: NameSchema.optional(),
    notes: NotesSchema.optional(),
    panel: PanelInputSchema.optional(),
    /** The library sound to copy (`slug`), or a sound someone shared, by its public address (`shared`). */
    source: z
      .union([
        z.object({ slug: SoundSlugSchema }).strict(),
        z.object({ shared: SharedSlugSchema }).strict(),
      ])
      .optional(),
  })
  .refine((v) => v.panel || v.source, {
    message: 'Send the panel, or name the library sound to copy',
    path: ['panel'],
  })
  .refine((v) => v.name || v.source, { message: 'Name the sound', path: ['name'] });
export type CreateUserSound = z.infer<typeof CreateUserSoundSchema>;

/**
 * `PATCH /api/v1/sounds/:id`. A new panel is saved on the synth's current definition. `notes: null` clears them.
 * `visibility` is `private` or `link` only.
 */
export const UpdateUserSoundSchema = z
  .object({
    name: NameSchema.optional(),
    notes: NotesSchema.nullable().optional(),
    panel: PanelInputSchema.optional(),
    /** Share by link, or stop sharing. Publishing has its own route; this unpublishes a published sound. */
    visibility: z.enum(['private', 'link']).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.notes !== undefined ||
      v.panel !== undefined ||
      v.visibility !== undefined,
    { message: 'Nothing to change' }
  );
export type UpdateUserSound = z.infer<typeof UpdateUserSoundSchema>;

/**
 * `POST /api/v1/sounds/:id/publish`. `confirm` is the "I made this, or the sound it came from is credited on it" tick;
 * `tags` are up to three of the tags that synth's library sounds use; left out, a republished sound keeps the ones it
 * had.
 */
export const PublishUserSoundSchema = z.object({
  confirm: z.literal(true, { error: 'Confirm the sound is yours to publish' }),
  tags: z
    .array(SoundTagSchema)
    .max(MAX_SOUND_TAGS, `At most ${MAX_SOUND_TAGS} tags`)
    .refine((t) => new Set(t).size === t.length, 'A tag is listed twice')
    .optional(),
});
export type PublishUserSound = z.infer<typeof PublishUserSoundSchema>;

/** `GET /api/v1/sounds`: one synth's sounds, or every one of the caller's. */
export const ListUserSoundsQuerySchema = z.object({ synthId: SynthIdSchema.optional() });

/** The library sound a user sound was copied from, as it read when copied. */
export interface UserSoundSource {
  /** The library sound's row, or null once it has been removed. */
  soundId: string | null;
  slug: string;
  name: string;
  /** `In the style of <artist> — "<work>"`. */
  ref: string;
}

/**
 * The shared sound a copy came from: "From _name_ by @_username_". Present only while that sound is published and its
 * owner has a username, and read when asked for, never kept, so it is gone once the sound or its owner is.
 */
export interface SharedSource {
  name: string;
  username: string;
  synthId: string;
  slug: string;
}

/** A user's sound as their list shows it. */
export interface UserSoundSummary {
  id: string;
  synthId: string;
  name: string;
  notes: string | null;
  /** The definition version the panel was saved on. */
  definitionVersion: number;
  source: UserSoundSource | null;
  /** The shared sound it was copied from, while that is published. */
  basedOn: SharedSource | null;
  visibility: SoundVisibility;
  /** Its public address once it has been shared; kept when it goes private again. */
  slug: string | null;
  /** When it was first published, if it has been. */
  publishedAt: string | null;
  tags: string[];
  /**
   * Whether the panel can be played on the synth as it is now. False when it was saved on a definition version the
   * synth has moved on from with no mapping between them (D1), or when it no longer passes the definition.
   */
  playable: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A user's sound with its panel. */
export interface UserSoundDetail extends UserSoundSummary {
  /** The panel, checked against the synth's definition; null when it is not `playable`, and `problems` says why. */
  panel: { values: ControlValues; cables: CablePair[] } | null;
  problems: string[];
  /**
   * When the panel is not `playable`: as much of it as fits the synth now. Controls it no longer has, values out of
   * range and cables to jacks it does not have are dropped, and every control missing takes its `init`. The synth page
   * opens this and says what `problems` lists, rather than refusing the sound. Null when `panel` is set, or when the
   * synth is not one the app can play.
   */
  fitted: { values: ControlValues; cables: CablePair[] } | null;
}

/**
 * A shared sound as anyone may see it (`GET /api/v1/public/sounds/:slug`). Never the owner's user id, account name or
 * email, nor the row's own id: its address is the slug, and its author the username.
 */
export interface PublicSound {
  slug: string;
  synthId: string;
  visibility: Exclude<SoundVisibility, 'private'>;
  name: string;
  notes: string | null;
  tags: string[];
  publishedAt: string | null;
  /**
   * `@username` for a published sound. For a link share, only when the owner's profile is public: sharing a link is
   * not choosing to be named. Null when there is none to show.
   */
  author: string | null;
  /** Whether `/u/<author>` shows anything, so the byline can link to it. */
  authorProfile: boolean;
  /** The library sound it was copied from, as it read then. */
  source: Omit<UserSoundSource, 'soundId'> | null;
  basedOn: SharedSource | null;
  definitionVersion: number;
  playable: boolean;
  panel: UserSoundDetail['panel'];
  problems: string[];
  fitted: UserSoundDetail['fitted'];
}
