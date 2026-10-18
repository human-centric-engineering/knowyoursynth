/**
 * The tutor's tools, one instance each. `lib/app/capabilities.ts` registers them with the dispatcher and the seed
 * (`prisma/seeds/app-knowyoursynth/003-tutor-tools.ts`) writes each one's capability row from its
 * `functionDefinition`, so the row the model is shown and the class that runs cannot disagree.
 *
 * Every tool reads the panel the stream route passed as `entityContext` and only proposes: none writes anything, and
 * none reads a user.
 */
import { DescribeSynthCapability } from '@/lib/app/tutor/describe-synth';
import { DesignSoundCapability } from '@/lib/app/tutor/design-sound';
import { GetPanelCapability } from '@/lib/app/tutor/get-panel';
import { ProposePanelChangeCapability } from '@/lib/app/tutor/propose-panel-change';

export const TUTOR_TOOLS = [
  new GetPanelCapability(),
  new DescribeSynthCapability(),
  new ProposePanelChangeCapability(),
  new DesignSoundCapability(),
] as const;
