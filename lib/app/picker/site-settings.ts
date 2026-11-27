/**
 * The site's synth picker settings (`f-synth-picker` t-329): admin config, one row (`SynthPickerSettings`, id "site"),
 * shared by every org. Server only.
 *
 * - **No row is the defaults.** Until an admin saves, `FACTORY_PICKER` is the site's settings; nothing is seeded, so a
 *   change to the defaults in code reaches every install that has not chosen its own.
 * - **Checked on the way out as well as in.** A row edited outside the app into a shape the schema refuses is logged
 *   and read as the defaults, rather than breaking every synth page.
 *
 * See `lib/app/picker/settings.ts` for the shapes, and `.context/app/synth-picker.md`.
 */
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import {
  FACTORY_PICKER,
  SitePickerSettingsSchema,
  type SitePickerSettings,
} from '@/lib/app/picker/settings';

/** The one row's id. */
const SITE = 'site';

const COLUMNS = {
  group: true,
  order: true,
  kinds: true,
  thumbs: true,
  visitorsMayChange: true,
  offerAll: true,
} as const;

/** The site's settings: the row's, or the defaults when there is none (or it cannot be read as settings). */
export async function getSitePickerSettings(): Promise<SitePickerSettings> {
  const row = await prisma.synthPickerSettings.findUnique({ where: { id: SITE }, select: COLUMNS });
  if (!row) return FACTORY_PICKER;
  const parsed = SitePickerSettingsSchema.safeParse(row);
  if (parsed.success) return parsed.data;
  logger.error(
    'synth picker: the site settings row is not valid, serving the defaults',
    undefined,
    {
      issues: parsed.error.issues.map((i) => i.message),
    }
  );
  return FACTORY_PICKER;
}

/** Replace the site's settings with `next`, returning what they were and are now (for the audit log). */
export async function setSitePickerSettings(
  next: SitePickerSettings
): Promise<{ before: SitePickerSettings; after: SitePickerSettings }> {
  const before = await getSitePickerSettings();
  await prisma.synthPickerSettings.upsert({
    where: { id: SITE },
    create: { id: SITE, ...next },
    update: next,
  });
  return { before, after: next };
}

/**
 * The site's settings for a page to render with: a failed read is logged and served as the defaults, since the picker
 * lists synths either way and is not worth failing a synth page over.
 */
export async function sitePickerForPage(): Promise<SitePickerSettings> {
  try {
    return await getSitePickerSettings();
  } catch (err) {
    logger.warn('synth picker: could not read the site settings, serving the defaults', {
      err: String(err),
    });
    return FACTORY_PICKER;
  }
}
