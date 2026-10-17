import { SynthProfileForm } from '@/components/app/account/synth-profile-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AccountSectionProps } from '@/lib/account-sections/registry';
import { getProfile } from '@/lib/app/profile/profile';

/**
 * Settings → Synth profile (`f-profiles` r1): the username a user's public page goes under, their links, and who may
 * see it.
 *
 * Registered through the `account-sections` seam (`lib/app/account-sections.ts`), on settings only: `/profile` is
 * Sunrise's account card, whose name field is the private account name this one exists to keep apart. A server
 * component: it reads the profile with the page and hands it to the form.
 */
export async function SynthProfileSection({ userId }: AccountSectionProps) {
  const profile = await getProfile(userId);
  return (
    // `#synth-profile`: where Publish sends someone with no username yet (`chooseUsernameHref`).
    <Card id="synth-profile" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Synth profile</CardTitle>
        <CardDescription>
          Your username, where your music is, and who can see your page. Your account name and email
          are never public.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SynthProfileForm profile={profile} />
      </CardContent>
    </Card>
  );
}
