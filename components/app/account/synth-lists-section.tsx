import { SynthLists } from '@/components/app/account/synth-lists';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AccountSectionProps } from '@/lib/account-sections/registry';
import { listInstruments } from '@/lib/app/profile/instruments';

/**
 * Settings → Your synths (`f-profiles` r2): the synths a user owns and the ones they want, picked from the databank.
 *
 * Registered through the `account-sections` seam (`lib/app/account-sections.ts`), on settings only, below the synth
 * profile whose switches say whether a public page shows these lists. A server component: it reads both lists with the
 * page and hands them to the client.
 */
export async function SynthListsSection({ userId }: AccountSectionProps) {
  const lists = await listInstruments(userId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your synths</CardTitle>
        <CardDescription>
          The synths you own and the ones you&apos;re after. Your public page shows each list only
          if you switch it on in your synth profile.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SynthLists initial={lists} />
      </CardContent>
    </Card>
  );
}
