'use client';

/**
 * SynthEditor — everything about one synth in the catalogue (`f-catalogue-admin`), from one
 * `GET /api/v1/admin/synths/[id]`: its details, its sounds, its history section and its notes, a tab each.
 */

import { LineageForm } from '@/components/app/admin/synths/lineage-form';
import { NotesEditor } from '@/components/app/admin/synths/notes-editor';
import { SoundLibrary } from '@/components/app/admin/synths/sound-library';
import { SynthDetailsForm } from '@/components/app/admin/synths/synth-details-form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AdminSynthDetail } from '@/lib/app/catalogue/edit';

export const SYNTH_EDITOR_TABS = ['details', 'sounds', 'lineage', 'notes'] as const;
export type SynthEditorTab = (typeof SYNTH_EDITOR_TABS)[number];

export function SynthEditor({
  detail,
  tab = 'details',
}: {
  detail: AdminSynthDetail;
  tab?: SynthEditorTab;
}) {
  const { synth } = detail;
  const canAdd = detail.definitionVersion !== null;
  return (
    <Tabs defaultValue={tab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="sounds">Sounds ({detail.sounds.length})</TabsTrigger>
        <TabsTrigger value="lineage">Lineage</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="details">
        <SynthDetailsForm synth={synth} />
      </TabsContent>
      <TabsContent value="sounds">
        <SoundLibrary synthId={synth.id} sounds={detail.sounds} canAdd={canAdd} />
      </TabsContent>
      <TabsContent value="lineage">
        <LineageForm synthId={synth.id} lineage={detail.lineage} />
      </TabsContent>
      <TabsContent value="notes">
        <NotesEditor
          synthId={synth.id}
          notes={detail.notes}
          sharedLimits={detail.sharedLimits}
          canAdd={canAdd}
        />
      </TabsContent>
    </Tabs>
  );
}
