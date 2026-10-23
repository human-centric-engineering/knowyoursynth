/**
 * The tutor's tools, one instance each. `lib/app/capabilities.ts` registers them with the dispatcher and the seed
 * (`prisma/seeds/app-knowyoursynth/003-tutor-tools.ts`) writes each one's capability row from its
 * `functionDefinition`, so the row the model is shown and the class that runs cannot disagree.
 *
 * The panel and pattern tools read what the stream route passed as `entityContext` and only propose; `search_databank` reads
 * the databank, and `web_search` asks Brave. None writes anything. Only `web_search` reads anything about the caller:
 * their daily allowance, which each search counts against.
 */
import { DescribeSynthCapability } from '@/lib/app/tutor/describe-synth';
import { DesignSoundCapability } from '@/lib/app/tutor/design-sound';
import { GetPanelCapability } from '@/lib/app/tutor/get-panel';
import { GetPatternCapability } from '@/lib/app/tutor/get-pattern';
import { ProposePanelChangeCapability } from '@/lib/app/tutor/propose-panel-change';
import { ProposePatternCapability } from '@/lib/app/tutor/propose-pattern';
import { SearchDatabankCapability } from '@/lib/app/tutor/search-databank';
import { WebSearchCapability } from '@/lib/app/tutor/web-search';

export const TUTOR_TOOLS = [
  new GetPanelCapability(),
  new DescribeSynthCapability(),
  new ProposePanelChangeCapability(),
  new DesignSoundCapability(),
  new GetPatternCapability(),
  new ProposePatternCapability(),
  new SearchDatabankCapability(),
  new WebSearchCapability(),
] as const;
