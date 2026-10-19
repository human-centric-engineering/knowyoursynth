/**
 * The tutor's tools, one instance each. `lib/app/capabilities.ts` registers them with the dispatcher and the seed
 * (`prisma/seeds/app-knowyoursynth/003-tutor-tools.ts`) writes each one's capability row from its
 * `functionDefinition`, so the row the model is shown and the class that runs cannot disagree.
 *
 * The panel tools read the panel the stream route passed as `entityContext` and only propose; `search_databank` reads
 * the databank. None writes anything, and none reads a user.
 */
import { DescribeSynthCapability } from '@/lib/app/tutor/describe-synth';
import { DesignSoundCapability } from '@/lib/app/tutor/design-sound';
import { GetPanelCapability } from '@/lib/app/tutor/get-panel';
import { ProposePanelChangeCapability } from '@/lib/app/tutor/propose-panel-change';
import { SearchDatabankCapability } from '@/lib/app/tutor/search-databank';

export const TUTOR_TOOLS = [
  new GetPanelCapability(),
  new DescribeSynthCapability(),
  new ProposePanelChangeCapability(),
  new DesignSoundCapability(),
  new SearchDatabankCapability(),
] as const;
